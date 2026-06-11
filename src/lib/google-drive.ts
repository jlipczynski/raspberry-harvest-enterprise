import { google } from 'googleapis'

const SCOPES = ['https://www.googleapis.com/auth/drive.readonly']

function getRedirectUri() {
  const base = process.env.NEXTAUTH_URL || process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:3000'
  return `${base}/api/auth/google-drive/callback`
}

export function createOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    getRedirectUri()
  )
}

export function getAuthUrl(state: string): string {
  const client = createOAuth2Client()
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
    state,
  })
}

export function createAuthenticatedClient(refreshToken: string) {
  const client = createOAuth2Client()
  client.setCredentials({ refresh_token: refreshToken })
  return client
}

export interface DriveFile {
  id: string
  name: string
  mimeType: string
  modifiedTime: string
}

export async function listCsvFiles(refreshToken: string, folderId: string): Promise<DriveFile[]> {
  const auth = createAuthenticatedClient(refreshToken)
  const drive = google.drive({ version: 'v3', auth })

  const files: DriveFile[] = []
  let pageToken: string | undefined

  do {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and (mimeType='text/csv' or name contains '.csv') and trashed=false`,
      fields: 'nextPageToken, files(id, name, mimeType, modifiedTime)',
      pageSize: 100,
      pageToken,
      orderBy: 'name',
    })

    if (res.data.files) {
      for (const f of res.data.files) {
        if (f.id && f.name) {
          files.push({
            id: f.id,
            name: f.name,
            mimeType: f.mimeType || 'text/csv',
            modifiedTime: f.modifiedTime || '',
          })
        }
      }
    }
    pageToken = res.data.nextPageToken || undefined
  } while (pageToken)

  return files
}

export async function getFileContent(refreshToken: string, fileId: string): Promise<string> {
  const auth = createAuthenticatedClient(refreshToken)
  const drive = google.drive({ version: 'v3', auth })

  const res = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'text' }
  )

  return res.data as string
}
