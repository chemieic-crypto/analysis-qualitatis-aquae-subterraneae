import re
with open('src/components/GisChoroplethMap.tsx', 'r') as f:
    code = f.read()

bad_check = r'''  const checkIfFeatureMatchesFilter = \(f: any\): boolean => \{'''
good_check = '''  const checkIfFeatureMatchesFilter = (f: any, gList: any[]): boolean => {'''
code = re.sub(bad_check, good_check, code)

# fix the caller of checkIfFeatureMatchesFilter
bad_call = r'''if \(!checkIfFeatureMatchesFilter\(f\)\) return;'''
good_call = '''if (!checkIfFeatureMatchesFilter(f, gList)) return;'''
code = re.sub(bad_call, good_call, code)

with open('src/components/GisChoroplethMap.tsx', 'w') as f:
    f.write(code)
