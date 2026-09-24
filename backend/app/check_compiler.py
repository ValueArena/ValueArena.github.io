"""Build-time check for the C toolchain needed by Triton's runtime helpers."""
import importlib.util
import os
from pathlib import Path
import shlex
import shutil
import subprocess
import sysconfig
import tempfile


def main():
    compiler = shlex.split(os.environ.get('CC', 'cc'))
    if not compiler or not shutil.which(compiler[0]):
        raise RuntimeError('GPU worker requires a C compiler for Triton')
    source = '''#include <Python.h>
static struct PyModuleDef module = {PyModuleDef_HEAD_INIT, "_compiler_check", NULL, -1, NULL};
PyMODINIT_FUNC PyInit__compiler_check(void) { return PyModule_Create(&module); }
'''
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        src = root/'check.c'; src.write_text(source)
        target = root/('_compiler_check' + sysconfig.get_config_var('EXT_SUFFIX'))
        subprocess.run([*compiler, '-shared', '-fPIC', '-O2',
                        '-I'+sysconfig.get_path('include'), str(src), '-o', str(target)], check=True)
        spec = importlib.util.spec_from_file_location('_compiler_check', target)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
    print('C compiler and Python extension headers: compile and import passed')


if __name__ == '__main__':
    main()
