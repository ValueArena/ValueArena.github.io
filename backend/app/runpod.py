import time
import httpx
from .auth import worker_token


MIN_CUDA_VERSION = '13.0'


class GPUUnavailable(RuntimeError):
    pass


class AllocationRejected(RuntimeError):
    pass


def gpu_availability(disk_gb=100):
    # Public stock lookup: no user/provider credentials are sent or stored.
    query = """query($input: GpuLowestPriceInput!) {
        gpuTypes { id lowestPrice(input: $input) {
            stockStatus uninterruptablePrice
        } }
    }"""
    response = httpx.post('https://api.runpod.io/graphql', json={
        'query': query, 'variables': {'input': {'gpuCount': 1, 'secureCloud': True,
        'minCudaVersion': MIN_CUDA_VERSION, 'minDisk': disk_gb}}}, timeout=15)
    response.raise_for_status()
    body = response.json()
    if body.get('errors') or not isinstance(body.get('data', {}).get('gpuTypes'), list):
        raise ValueError('RunPod availability unavailable')
    rows = []
    for gpu in body['data']['gpuTypes']:
        price = gpu.get('lowestPrice') or {}
        stock = price.get('stockStatus')
        rows.append({'id': gpu['id'], 'stock': stock if stock in ('High','Medium','Low','None') else 'Unknown',
                     'price_per_hour': price.get('uninterruptablePrice')})
    return {'gpus': rows, 'checked_at': int(time.time()), 'min_cuda_version': MIN_CUDA_VERSION,
            'disk_gb': disk_gb, 'cloud': 'SECURE'}


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
        # GraphQL supports a minimum version; the REST enum omits newer CUDA versions.
        payload = {'name': self.name(job['id']), 'imageName': self.cfg.worker_image,
            'cloudType': 'SECURE', 'computeType': 'GPU',
            'gpuTypeId': job['config'].get('gpu_type', self.cfg.runpod_gpu_type),
            'gpuCount': self.cfg.runpod_gpu_count,
            'containerDiskInGb': job['config'].get('disk_gb', self.cfg.runpod_disk_gb),
            'minCudaVersion': MIN_CUDA_VERSION, 'volumeInGb': 0, 'ports': '',
            'startSsh': False, 'startJupyter': False,
            'env': [{'key': key, 'value': value} for key, value in env.items()]}
        response = self.client.post('https://api.runpod.io/graphql', json={
            'query': 'mutation($input: PodFindAndDeployOnDemandInput!) { podFindAndDeployOnDemand(input: $input) { id } }',
            'variables': {'input': payload}})
        response.raise_for_status()
        body = response.json()
        result = (body.get('data') or {}).get('podFindAndDeployOnDemand')
        if not result and body.get('errors'):
            # Only known, definitive rejections are safe to retry. Never persist
            # provider messages, which can contain submitted environment values.
            messages = [str(e.get('message', '')).lower() for e in body['errors']]
            if messages and all(any(marker in m for marker in (
                'no available gpu', 'no gpu available', 'not enough free gpus',
                'does not have the resources to deploy', 'no instances available',
                'no longer any instances available with the requested specifications'
            )) for m in messages):
                raise GPUUnavailable('Selected GPU is unavailable')
            if messages and all(any(marker in m for marker in (
                'unauthorized', 'invalid api key', 'insufficient balance', 'invalid gpu type'
            )) for m in messages):
                raise AllocationRejected('RunPod rejected the credentials, balance, or configuration')
        if body.get('errors') or not result or not result.get('id'):

            # Do not expose provider messages: they may echo env secrets. Reconcile
            # by deterministic pod name, as with an uncertain REST response.
            raise RuntimeError('RunPod did not confirm GPU allocation')
        return result['id']

    def delete(self, pod_id):
        response = self.client.delete('/pods/' + pod_id)
        if response.status_code != 404: response.raise_for_status()
