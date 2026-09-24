"""Upload a build folder with relative FTP paths.

IIS FTP rejects CWD /static (a leading slash). This walks one folder
name at a time and reuses static when it already exists.
"""
import os
import sys
from ftplib import FTP, error_perm
from pathlib import Path

server = os.environ["FTP_SERVER"]
user = os.environ["FTP_USER"]
password = os.environ["FTP_PASS"]
local_dir = Path(os.environ["LOCAL_DIR"])
remote_dir = os.environ.get("REMOTE_DIR", ".")

if not local_dir.is_dir():
    sys.exit(f"Local folder not found: {local_dir}")


def enter(ftp: FTP, here: list[str], part: str) -> None:
    if part in ("", "."):
        return
    if part == "..":
        ftp.cwd("..")
        if here:
            here.pop()
        return
    try:
        ftp.cwd(part)
    except error_perm:
        try:
            ftp.mkd(part)
        except error_perm:
            pass
        ftp.cwd(part)
    here.append(part)


def goto(ftp: FTP, here: list[str], parts: list[str]) -> None:
    while here != parts[: len(here)]:
        ftp.cwd("..")
        if not here:
            sys.exit("FTP path climbed above the login folder")
        here.pop()
    for part in parts[len(here) :]:
        enter(ftp, here, part)


ftp = FTP()
ftp.connect(server, 21, timeout=120)
ftp.login(user, password)
ftp.set_pasv(True)

here: list[str] = []
remote_parts = [p for p in remote_dir.replace("\\", "/").split("/") if p and p != "."]
goto(ftp, here, remote_parts)
base = list(here)
print(f"Uploading {local_dir} under login folder {'/'.join(base) or '.'}")

def store(ftp: FTP, name: str, path: Path) -> None:
    """Replace an existing file. IIS returns 550 when STOR cannot overwrite."""
    try:
        ftp.delete(name)
    except error_perm:
        pass
    try:
        with path.open("rb") as handle:
            ftp.storbinary(f"STOR {name}", handle)
    except error_perm:
        with path.open("rb") as handle:
            ftp.storbinary(f"STOR {name}", handle)


count = 0
for path in local_dir.rglob("*"):
    if not path.is_file() or path.suffix == ".map":
        continue
    rel = path.relative_to(local_dir).as_posix()
    folder, _, name = rel.rpartition("/")
    extra = [p for p in folder.split("/") if p]
    goto(ftp, here, base + extra)
    remote = "/".join(here + [name])
    try:
        store(ftp, name, path)
    except error_perm as exc:
        sys.exit(f"FTP refused {remote}: {exc}")
    count += 1
    print(f"uploaded {rel}")

ftp.quit()
print(f"Uploaded {count} files")
