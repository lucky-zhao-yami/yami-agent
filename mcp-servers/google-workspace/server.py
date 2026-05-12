import json
import os
from pathlib import Path

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from mcp.server.fastmcp import FastMCP

SCOPES = [
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/documents",
    "https://www.googleapis.com/auth/presentations",
    "https://www.googleapis.com/auth/spreadsheets",
]

mcp = FastMCP("google-workspace")


def get_credentials() -> Credentials:
    """Load or create OAuth credentials."""
    credentials_path = os.environ.get("CREDENTIALS_PATH", "credentials.json")
    token_path = os.environ.get("TOKEN_PATH", "token.json")

    creds = None
    if Path(token_path).exists():
        with open(token_path) as f:
            creds = Credentials.from_authorized_user_info(json.load(f), SCOPES)

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file(credentials_path, SCOPES)
            creds = flow.run_local_server(port=0)
        with open(token_path, "w") as f:
            f.write(creds.to_json())

    return creds


def get_docs_service():
    return build("docs", "v1", credentials=get_credentials())


def get_drive_service():
    return build("drive", "v3", credentials=get_credentials())


def get_slides_service():
    return build("slides", "v1", credentials=get_credentials())


# ─── Google Docs Tools ───────────────────────────────────────────────────────


@mcp.tool()
def create_doc(title: str, content: str = "", folder_id: str | None = None) -> dict:
    """Create a Google Doc.

    Args:
        title: Document title
        content: Initial text content
        folder_id: Optional Drive folder ID to place the doc in
    """
    docs = get_docs_service()
    doc = docs.documents().create(body={"title": title}).execute()
    doc_id = doc["documentId"]

    if folder_id:
        drive = get_drive_service()
        file = drive.files().get(fileId=doc_id, fields="parents").execute()
        drive.files().update(
            fileId=doc_id,
            addParents=folder_id,
            removeParents=",".join(file.get("parents", [])),
            fields="id,parents",
        ).execute()

    if content:
        docs.documents().batchUpdate(
            documentId=doc_id,
            body={"requests": [{"insertText": {"location": {"index": 1}, "text": content}}]},
        ).execute()

    return {"id": doc_id, "url": f"https://docs.google.com/document/d/{doc_id}/edit"}


@mcp.tool()
def read_doc(document_id: str) -> str:
    """Read a Google Doc's plain text content.

    Args:
        document_id: The document ID
    """
    docs = get_docs_service()
    doc = docs.documents().get(documentId=document_id).execute()

    text = ""
    for element in doc.get("body", {}).get("content", []):
        if "paragraph" in element:
            for run in element["paragraph"].get("elements", []):
                if "textRun" in run:
                    text += run["textRun"]["content"]
    return text


@mcp.tool()
def update_doc(document_id: str, content: str) -> str:
    """Replace all content in a Google Doc.

    Args:
        document_id: The document ID
        content: New text content to replace everything
    """
    docs = get_docs_service()
    doc = docs.documents().get(documentId=document_id).execute()

    end_index = doc["body"]["content"][-1]["endIndex"] - 1
    requests = []
    if end_index > 1:
        requests.append({"deleteContentRange": {"range": {"startIndex": 1, "endIndex": end_index}}})
    requests.append({"insertText": {"location": {"index": 1}, "text": content}})

    docs.documents().batchUpdate(documentId=document_id, body={"requests": requests}).execute()
    return "Document updated successfully."


@mcp.tool()
def append_to_doc(document_id: str, content: str) -> str:
    """Append text to the end of a Google Doc.

    Args:
        document_id: The document ID
        content: Text to append
    """
    docs = get_docs_service()
    doc = docs.documents().get(documentId=document_id).execute()
    end_index = doc["body"]["content"][-1]["endIndex"] - 1

    docs.documents().batchUpdate(
        documentId=document_id,
        body={"requests": [{"insertText": {"location": {"index": end_index}, "text": content}}]},
    ).execute()
    return "Content appended successfully."


# ─── Google Drive Tools ──────────────────────────────────────────────────────


@mcp.tool()
def list_files(folder_id: str | None = None, query: str | None = None) -> list[dict]:
    """List files in Google Drive.

    Args:
        folder_id: Optional folder ID to list files from
        query: Optional Drive query string (e.g. "name contains 'report'")
    """
    drive = get_drive_service()
    q_parts = []
    if folder_id:
        q_parts.append(f"'{folder_id}' in parents")
    if query:
        q_parts.append(query)
    q_parts.append("trashed = false")

    results = drive.files().list(
        q=" and ".join(q_parts),
        pageSize=100,
        fields="files(id, name, mimeType, modifiedTime, size)",
    ).execute()
    return results.get("files", [])


@mcp.tool()
def create_folder(name: str, parent_id: str | None = None) -> dict:
    """Create a folder in Google Drive.

    Args:
        name: Folder name
        parent_id: Optional parent folder ID
    """
    drive = get_drive_service()
    metadata: dict = {"name": name, "mimeType": "application/vnd.google-apps.folder"}
    if parent_id:
        metadata["parents"] = [parent_id]

    folder = drive.files().create(body=metadata, fields="id, name").execute()
    return {"id": folder["id"], "name": folder["name"]}


@mcp.tool()
def move_file(file_id: str, folder_id: str) -> str:
    """Move a file to a different folder.

    Args:
        file_id: The file ID to move
        folder_id: Destination folder ID
    """
    drive = get_drive_service()
    file = drive.files().get(fileId=file_id, fields="parents").execute()
    previous_parents = ",".join(file.get("parents", []))

    drive.files().update(
        fileId=file_id,
        addParents=folder_id,
        removeParents=previous_parents,
        fields="id, parents",
    ).execute()
    return "File moved successfully."


@mcp.tool()
def share_file(file_id: str, email: str, role: str = "reader") -> str:
    """Share a file with a user.

    Args:
        file_id: The file ID to share
        email: Email address to share with
        role: Permission role - 'reader', 'writer', or 'commenter'
    """
    drive = get_drive_service()
    drive.permissions().create(
        fileId=file_id,
        body={"type": "user", "role": role, "emailAddress": email},
        sendNotificationEmail=True,
    ).execute()
    return f"File shared with {email} as {role}."


@mcp.tool()
def get_file_info(file_id: str) -> dict:
    """Get file metadata from Google Drive.

    Args:
        file_id: The file ID
    """
    drive = get_drive_service()
    return drive.files().get(
        fileId=file_id,
        fields="id, name, mimeType, size, modifiedTime, createdTime, owners, parents, webViewLink",
    ).execute()


@mcp.tool()
def delete_file(file_id: str) -> str:
    """Delete a file from Google Drive (moves to trash).

    Args:
        file_id: The file ID to delete
    """
    drive = get_drive_service()
    drive.files().update(fileId=file_id, body={"trashed": True}).execute()
    return "File moved to trash."


# ─── Google Slides Tools ─────────────────────────────────────────────────────


@mcp.tool()
def create_presentation(title: str) -> dict:
    """Create a blank Google Slides presentation.

    Args:
        title: Presentation title
    """
    slides = get_slides_service()
    presentation = slides.presentations().create(body={"title": title}).execute()
    pres_id = presentation["presentationId"]
    return {"id": pres_id, "url": f"https://docs.google.com/presentation/d/{pres_id}/edit"}


@mcp.tool()
def read_presentation(presentation_id: str) -> list[dict]:
    """Read text content from all slides in a presentation.

    Args:
        presentation_id: The presentation ID
    """
    slides = get_slides_service()
    presentation = slides.presentations().get(presentationId=presentation_id).execute()

    result = []
    for i, slide in enumerate(presentation.get("slides", []), 1):
        texts = []
        for element in slide.get("pageElements", []):
            shape = element.get("shape", {})
            text_elements = shape.get("text", {}).get("textElements", [])
            for te in text_elements:
                if "textRun" in te:
                    texts.append(te["textRun"]["content"])
        result.append({"slide": i, "text": "".join(texts)})
    return result


# ─── Entry Point ─────────────────────────────────────────────────────────────


def main():
    mcp.run(transport="stdio")


if __name__ == "__main__":
    main()
