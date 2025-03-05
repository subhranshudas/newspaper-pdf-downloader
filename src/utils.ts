import { WebClient } from "@slack/web-api";
import fs from "fs/promises";
import path from "path";

export function getFormattedDate(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const year = now.getFullYear();
  return `${year}-${month}-${day}`;
}

interface SlackResponse {
  status: string;
  messageId?: string;
  error?: string;
}

export async function sendPDFToSlack(
  filePath: string,
  channelId: string,
  token: string
): Promise<SlackResponse> {
  try {
    const web = new WebClient(token);
    const fileContent = await fs.readFile(filePath);
    const fileName = path.basename(filePath);

    // Step 1: Get upload URL
    const uploadUrlResponse = await web.files.getUploadURLExternal({
      filename: fileName,
      length: fileContent.length,
    });

    if (!uploadUrlResponse.ok) {
      throw new Error(uploadUrlResponse.error || "Failed to get upload URL");
    }

    // Step 2: Upload file to the URL
    const formData = new FormData();
    formData.append(
      "file",
      new Blob([fileContent], { type: "application/pdf" }),
      fileName
    );

    if (!uploadUrlResponse.upload_url) {
      throw new Error("No upload URL provided by Slack");
    }

    const uploadResponse = await fetch(uploadUrlResponse.upload_url, {
      method: "POST",
      body: formData,
    });

    if (!uploadResponse.ok) {
      throw new Error("Failed to upload file to Slack");
    }

    if (!uploadUrlResponse.file_id) {
      throw new Error("No file ID provided by Slack");
    }

    // Step 3: Complete the upload
    const completeResponse = await web.files.completeUploadExternal({
      files: [
        {
          id: uploadUrlResponse.file_id,
          title: fileName,
        },
      ],
      channel_id: channelId,
      initial_comment: `📰 Daily Newspaper - ${fileName}`,
    });

    if (!completeResponse.ok) {
      throw new Error(
        completeResponse.error || "Failed to complete file upload"
      );
    }

    return {
      status: "success",
      messageId: completeResponse.files?.[0]?.id,
    };
  } catch (error) {
    console.error("❌ Error sending file to Slack:", error);
    return {
      status: "error",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
