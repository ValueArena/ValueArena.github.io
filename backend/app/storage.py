from pathlib import Path
from urllib.parse import quote
import httpx


class SupabaseStorage:
    def __init__(self, settings):
        self.settings = settings
        self.root = settings.supabase_url.rstrip('/') + '/storage/v1'
        self.headers = {'apikey': settings.supabase_secret_key}
        # New sb_secret keys are API keys, not JWT bearer tokens.
        if not settings.supabase_secret_key.startswith('sb_secret_'):
            self.headers['Authorization'] = 'Bearer ' + settings.supabase_secret_key

    def put(self, key, path):
        url = f'{self.root}/object/{self.settings.storage_bucket}/{quote(key, safe="/")}'
        with open(path, 'rb') as source:
            response = httpx.post(url, headers={**self.headers, 'Content-Type': 'application/gzip', 'x-upsert': 'true'},
                                  content=source, timeout=180)
        response.raise_for_status()

    def fetch(self,key,target,max_bytes):
        url=self.download_url(key)
        total=0
        with httpx.stream('GET',url,timeout=180) as response:
            response.raise_for_status()
            for chunk in response.iter_bytes():
                total+=len(chunk)
                if total>max_bytes:raise ValueError('Artifact exceeds size limit')
                target.write(chunk)


    def download_url(self, key):
        response = httpx.post(f'{self.root}/object/sign/{self.settings.storage_bucket}/{quote(key, safe="/")}',
            headers=self.headers, json={'expiresIn': 300}, timeout=30)
        response.raise_for_status()
        return self.root + response.json()['signedURL']


class LocalStorage:
    """Local integration tests only. Download is served through the authenticated API."""
    def __init__(self, root):
        self.root = Path(root)

    def put(self, key, path):
        import shutil
        dest = self.root / key
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(path, dest)

    def fetch(self,key,target,max_bytes):
        path=self.root/key
        if path.stat().st_size>max_bytes:raise ValueError('Artifact exceeds size limit')
        with path.open('rb') as source:
            import shutil
            shutil.copyfileobj(source,target)
