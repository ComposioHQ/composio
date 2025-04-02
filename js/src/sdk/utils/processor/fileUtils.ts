import { Client } from "@hey-api/client-axios";
import axios, { AxiosError } from "axios";
import crypto from "crypto";
import pathModule from "path";
import apiClient from "../../client/client";
import { saveFile } from "../fileUtils";

const readFileContent = async (
  path: string
): Promise<{ content: string; mimeType: string }> => {
  try {
    const content = require("fs").readFileSync(path);
    return {
      content: content.toString("base64"),
      mimeType: "application/octet-stream",
    };
  } catch (error) {
    throw new Error(`Error reading file at ${path}: ${error}`);
  }
};

const readFileContentFromURL = async (
  path: string
): Promise<{ content: string; mimeType: string }> => {
  const response = await axios.get(path, {
    responseType: "arraybuffer",
  });
  const content = Buffer.from(response.data);
  const mimeType =
    response.headers["content-type"] || "application/octet-stream";
  return {
    content: content.toString("base64"),
    mimeType,
  };
};

const uploadFileToS3 = async (
  content: string,
  actionName: string,
  appName: string,
  mimeType: string,
  client: Client
): Promise<string> => {
  const extension = mimeType.split("/")[1] || "bin";
  const response = await apiClient.actionsV2.createFileUploadUrl({
    client: client,
    body: {
      action: actionName,
      app: appName,
      filename: `${actionName}_${Date.now()}.${extension}`,
      mimetype: mimeType,
      md5: crypto
        .createHash("md5")
        .update(Buffer.from(content, "base64"))
        .digest("hex"),
    },
    path: {
      fileType: "request",
    },
  });

  const data = response.data as unknown as { url: string; key: string };
  const signedURL = data!.url;
  const s3key = data!.key;

  try {
    const buffer = Buffer.from(content, "base64");
    await axios.put(signedURL, buffer, {
      headers: {
        "Content-Type": mimeType,
        "Content-Length": buffer.length,
      },
    });
  } catch (e) {
    const error = e as AxiosError;
    if (error instanceof AxiosError && error.response?.status === 403) {
      return signedURL;
    }
    throw new Error(`Error uploading file to S3: ${error}`);
  }

  return s3key;
};

export const getFileDataAfterUploadingToS3 = async (
  path: string,
  actionName: string,
  client: Client
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
    fileData.mimeType,
    client
  );

  return {
    name: pathModule.basename(path) || `${actionName}_${Date.now()}`,
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
  const response = await axios.get(s3Url, {
    responseType: "arraybuffer",
  });

  const extension = mimeType.split("/")[1] || "txt";
  const fileName = `${actionName}_${Date.now()}.${extension}`;
  const filePath = saveFile(fileName, response.data, true);
  return {
    name: fileName,
    mimeType: mimeType,
    s3Key: s3Url,
    filePath: filePath,
  };
};
