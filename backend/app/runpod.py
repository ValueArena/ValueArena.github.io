import httpx
from .auth import worker_token


class RunPod:
    def __init__(self, settings):
        self.cfg = settings
        self.client = httpx.Client(base_url='https://rest.runpod.io/v1',
            headers={'Authorization': 'Bearer ' + settings.runpod_api_key}, timeout=45)

    @staticmethod
    def name(job_id): return 'valuearena-' + job_id

    def list(self):
        response = self.client.get('/pods')
        response.raise_for_status()
        return response.json()

    def create(self, job):
        env = {'VA_JOB_ID': job['id'], 'VA_API_URL': self.cfg.api_public_url,
               'VA_WORKER_TOKEN': worker_token(self.cfg.worker_secret, job['id']),
               'OPENROUTER_API_KEY': self.cfg.openrouter_api_key,
               'HF_TOKEN': self.cfg.hf_token}
        payload = {'name': self.name(job['id']), 'imageName': self.cfg.worker_image,
            'cloudType': 'SECURE', 'computeType': 'GPU', 'gpuTypeIds': [job['config'].get('gpu_type', self.cfg.runpod_gpu_type)],
            'gpuCount': self.cfg.runpod_gpu_count, 'containerDiskInGb': job['config'].get('disk_gb', self.cfg.runpod_disk_gb),
            # CUDA 13 worker wheels cannot initialize on CUDA 12.x hosts.
            # 13.0 is currently the highest version accepted by RunPod's v1 API.
            'allowedCudaVersions': ['13.0'],
            'volumeInGb': 0, 'interruptible': False, 'ports': [], 'env': env}
        response = self.client.post('/pods', json=payload)
        response.raise_for_status()
        return response.json()['id']

    def delete(self, pod_id):
        response = self.client.delete('/pods/' + pod_id)
        if response.status_code != 404: response.raise_for_status()
