"""Check publication limits on project files, without reading credentials or remotes."""
import pathlib, subprocess
root=pathlib.Path(__file__).resolve().parents[1]
files=subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard','-z'],cwd=root).decode().split('\0')
files=sorted(set(f for f in files if f))
assert len(files)<=1000, len(files)
total=0
for name in files:
    p=root/name
    assert p.is_file() and not p.is_symlink(),name
    n=p.stat().st_size;assert n<=10*1024*1024,(name,n);total+=n
    assert not name.endswith('.log') or name=='results/tests.log',name
assert total<=32*1024*1024,total
print(f'PASS: {len(files)} project files, {total} bytes; file/tree publication limits satisfied')
