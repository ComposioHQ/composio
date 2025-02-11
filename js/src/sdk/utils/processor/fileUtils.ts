import axios, { AxiosError } from "axios";
import crypto from "crypto";
import apiClient from "../../client/client";
import { saveFile } from "../fileUtils";

const readFileContent = async (
  path: string
): Promise<{ content: string; mimeType: string }> => {
  try {
    const content = require("fs").readFileSync(path, "utf-8");
    return { content, mimeType: "text/plain" };
  } catch (error) {
    throw new Error(`Error reading file at ${path}: ${error}`);
  }
};

const readFileContentFromURL = async (
  path: string
): Promise<{ content: string; mimeType: string }> => {
  const response = await fetch(path);
  const content = await response.text();
  const mimeType = response.headers.get("content-type") || "text/plain";
  return { content, mimeType };
};

const uploadFileToS3 = async (
  content: string,
  actionName: string,
  appName: string,
  mimeType: string
): Promise<string> => {
  const response = await apiClient.actionsV2.createFileUploadUrl({
    body: {
      action: actionName,
      app: appName,
      filename: `${actionName}_${Date.now()}`,
      mimetype: mimeType,
      md5: crypto.createHash("md5").update(content).digest("hex"),
    },
    path: {
      fileType: "request",
    },
  });

  const data = response.data as unknown as { url: string; key: string };
  const signedURL = data!.url;
  const s3key = data!.key;

  try {
    // Upload the file to the S3 bucket
    await axios.put(signedURL, content);
  } catch (e) {
    const error = e as AxiosError;
    // if error is 403, then continue
    if (error instanceof AxiosError && error.response?.status === 403) {
      return signedURL;
    }
    throw new Error(`Error uploading file to S3: ${error}`);
  }

  return s3key;
};

export const getFileDataAfterUploadingToS3 = async (
  path: string,
  actionName: string
): Promise<{
  name: string;
  mimetype: string;
  s3key: string;
}> => {
  const isURL = path.startsWith("http");
  const fileData = isURL
    ? await readFileContentFromURL(path)
    : await readFileContent(path);

  const s3key = await uploadFileToS3(
    fileData.content,
    actionName,
    actionName,
    fileData.mimeType
  );

  return {
    name: path.split("/").pop() || `${actionName}_${Date.now()}`,
    mimetype: fileData.mimeType,
    s3key: s3key,
  };
};

export const downloadFileFromS3 = async ({
  actionName,
  s3Url,
  mimeType,
}: {
  actionName: string;
  s3Url: string;
  mimeType: string;
}) => {
  const response = await axios.get(s3Url);

  const extension = mimeType.split("/")[1] || "txt";
  const fileName = `${actionName}_${Date.now()}`;
  const filePath = saveFile(fileName, response.data, true);
  return {
    name: fileName,
    mimeType: mimeType,
    s3Key: s3Url,
    filePath: filePath,
  };
};
