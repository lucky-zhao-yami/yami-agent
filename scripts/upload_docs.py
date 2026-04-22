#!/usr/bin/env python3
"""Upload markdown files to Google Docs: md → docx (pandoc) → Google Docs (Drive convert)."""
import json, os, subprocess, tempfile
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload

TOKEN_PATH = "/mnt/c/Users/17564/.gmail-mcp/token.json"
KEYS_PATH = "/mnt/c/Users/17564/.gmail-mcp/gcp-oauth.keys.json"

DOCS_DIR = "/mnt/d/code/yami/yami-agent/docs"
FILES = [
    ("yami-agent — 需求规格 (spec)", "spec.md"),
    ("yami-agent — 架构设计 (design)", "design.md"),
    ("yami-agent — 实现计划 (plan)", "plan.md"),
]

# IDs of previously uploaded docs to update (delete old, create new)
OLD_DOC_IDS = [
    "1xLgBMSfGe1F2KQLkkqySygsgB8QU4th5Bk4HUqQ5jn0",
    "1XZ26kuUpttw0MT5hK-mvMfdBpp99ie-grby7UfwE484",
    "1Yi6NBJVeLpi3tRuY6Jr7FEoO9l89zkg58TqZdeIyP-0",
]

def get_creds():
    with open(TOKEN_PATH) as f:
        token_data = json.load(f)
    with open(KEYS_PATH) as f:
        keys_data = json.load(f)
    installed = keys_data.get("installed", keys_data.get("web", {}))
    return Credentials(
        token=token_data["token"],
        refresh_token=token_data.get("refresh_token"),
        token_uri="https://oauth2.googleapis.com/token",
        client_id=installed["client_id"],
        client_secret=installed["client_secret"],
        scopes=token_data.get("scopes", []),
    )

def md_to_docx(md_path: str) -> str:
    """Convert markdown to docx using pandoc, return docx path."""
    docx_path = md_path.rsplit(".", 1)[0] + ".docx"
    subprocess.run(
        ["pandoc", md_path, "-o", docx_path, "--from=markdown", "--to=docx"],
        check=True,
    )
    return docx_path

def main():
    creds = get_creds()
    drive = build("drive", "v3", credentials=creds)

    # Delete old docs
    for doc_id in OLD_DOC_IDS:
        try:
            drive.files().delete(fileId=doc_id).execute()
            print(f"🗑️  Deleted old doc {doc_id}")
        except Exception:
            pass

    for title, filename in FILES:
        md_path = os.path.join(DOCS_DIR, filename)
        if not os.path.exists(md_path):
            print(f"SKIP {filename} (not found)")
            continue

        # Convert md → docx
        docx_path = md_to_docx(md_path)
        print(f"📄 Converted {filename} → docx")

        # Upload docx as Google Docs
        file_metadata = {
            "name": title,
            "mimeType": "application/vnd.google-apps.document",
        }
        media = MediaFileUpload(
            docx_path,
            mimetype="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        )
        result = drive.files().create(
            body=file_metadata, media_body=media, fields="id,webViewLink"
        ).execute()

        # Cleanup docx
        os.remove(docx_path)

        print(f"✅ {title}")
        print(f"   {result.get('webViewLink', result['id'])}")
        print()

if __name__ == "__main__":
    main()
