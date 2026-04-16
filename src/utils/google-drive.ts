import { google } from "googleapis";
import { createReadStream } from "fs";
import { basename } from "path";

const FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID!;

function getAuth() {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID!,
    process.env.GOOGLE_CLIENT_SECRET!,
    "urn:ietf:wg:oauth:2.0:oob"
  );
  oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN! });
  return oauth2Client;
}

export async function uploadToDrive(filePath: string, mimeType = "application/vnd.openxmlformats-officedocument.presentationml.presentation"): Promise<string> {
  const auth = getAuth();
  const drive = google.drive({ version: "v3", auth: auth as any });
  const fileName = basename(filePath);

  // Upload file
  const { data: file } = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [FOLDER_ID],
    },
    media: {
      mimeType,
      body: createReadStream(filePath),
    },
    fields: "id, webViewLink",
  });

  if (!file.id) throw new Error("Drive upload failed: no file ID returned");

  // Make it viewable by anyone with link
  await drive.permissions.create({
    fileId: file.id,
    requestBody: {
      role: "reader",
      type: "anyone",
    },
  });

  console.log(`Uploaded to Google Drive: ${file.webViewLink}`);
  return file.webViewLink!;
}
