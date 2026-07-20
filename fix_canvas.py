import re

with open('src/components/GisChoroplethMap.tsx', 'r') as f:
    code = f.read()

# Fix in downloadPng
download = r'''  const downloadPng = \(\) => \{
    const canvas = e\.currentTarget as HTMLCanvasElement;'''
new_download = '''  const downloadPng = () => {
    const canvas = canvasRef.current;'''
code = re.sub(download, new_download, code)

# Fix in handlePrint
print_fn = r'''  const handlePrint = \(\) => \{
    const canvas = e\.currentTarget as HTMLCanvasElement;'''
new_print_fn = '''  const handlePrint = () => {
    const canvas = canvasRef.current;'''
code = re.sub(print_fn, new_print_fn, code)

# Fix in handleSendToBulletin
bulletin = r'''  const handleSendToBulletin = \(\) => \{
    const canvas = e\.currentTarget as HTMLCanvasElement;'''
new_bulletin = '''  const handleSendToBulletin = () => {
    const canvas = canvasRef.current;'''
code = re.sub(bulletin, new_bulletin, code)

with open('src/components/GisChoroplethMap.tsx', 'w') as f:
    f.write(code)
