export type FileUploadData = {
  name: string;
  mimetype: string;
  s3key: string;
};

export type FileDownloadData = {
  name: string;
  mimeType: string;
  s3Url: string;
  filePath: string | null;
};
