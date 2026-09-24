"""Compile and load a CUDA extension during image build; no GPU is needed."""
import ctypes
import os
from pathlib import Path
import re
import subprocess
import tempfile


def main():
    import torch
    from flashinfer.jit.cpp_ext import get_cuda_path

    cuda = Path(get_cuda_path())
    nvcc = cuda / 'bin/nvcc'
    version = subprocess.check_output([str(nvcc), '--version'], text=True)
    match = re.search(r'release (\d+\.\d+)', version)
    if not match or match.group(1) != torch.version.cuda:
        raise RuntimeError('CUDA compiler must match the PyTorch CUDA build')
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        source = root / 'check.cu'
        source.write_text('''#include <cuda_runtime.h>
__global__ void check_kernel(float* x) { x[0] = 1.0f; }
extern "C" int toolchain_check() { return CUDART_VERSION; }
''')
        target = root / 'check.so'
        subprocess.run([str(nvcc), '-shared', '-Xcompiler=-fPIC', '-arch=sm_86',
                        str(source), '-o', str(target)], check=True)
        module = ctypes.CDLL(str(target))
        assert module.toolchain_check() >= 13000
    print('CUDA compiler, headers and runtime library: compile and load passed')


if __name__ == '__main__':
    main()
