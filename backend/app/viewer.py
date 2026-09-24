"""Prepare the published viewer format inside private result storage."""
import mimetypes
import tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Lock

from .publication import export_bundle

_prepare_lock = Lock()


def viewer_manifest(db, storage, job, max_bytes):
    # Existing successful runs are upgraded lazily; no evaluation is re-run.
    with _prepare_lock:
        saved = db.get_presentation(job['id'], 'viewer_files')
        if not saved:
            summary = db.get_presentation(job['id'], 'summary')
            if not summary or not job.get('artifact'):
                raise ValueError('Results are not available yet')
            with tempfile.TemporaryFile() as archive:
                storage.fetch(job['artifact'], archive, max_bytes)
                archive.seek(0)
                files, _ = export_bundle(job, archive, summary, max_bytes)
            keys = {name: f"viewer/{job['user_id']}/{job['id']}/{name}" for name in files}
            with tempfile.TemporaryDirectory() as directory:
                def upload(item):
                    name, data = item
                    path = Path(directory)/name
                    path.parent.mkdir(parents=True, exist_ok=True)
                    path.write_bytes(data)
                    storage.put(keys[name], path, content_type=mimetypes.guess_type(name)[0] or 'application/octet-stream')
                with ThreadPoolExecutor(max_workers=4) as pool:
                    list(pool.map(upload, files.items()))
            saved = {'files': keys}
            db.put_presentation(job['id'], 'viewer_files', saved)
    with ThreadPoolExecutor(max_workers=4) as pool:
        urls = dict(pool.map(lambda item: (item[0], storage.download_url(item[1])), saved['files'].items()))
    return {'files': urls, 'expires_in': 300}
