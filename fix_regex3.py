import re

with open('src/components/GisChoroplethMap.tsx', 'r') as f:
    code = f.read()

bad_pattern = r'  const groupListPost = useMemo\\\(\\\(\\\) => \\\{.*?reportingLevel\\\]\\\);'
bad_pattern2 = r'  const groupListPost = useMemo\(\(\) => \{[\s\S]*?reportingLevel\]\);'

def remove_backslashes(text):
    return text.replace('\\', '')

# I'll just manually replace the exact string
code = code.replace(r'  const groupListPost = useMemo\(\(\) => \{' + '\n', '  const groupListPost = useMemo(() => {\n')
code = code.replace(r'    return computeGroupList\(postDataSubset\);' + '\n', '    return computeGroupList(postDataSubset);\n')
code = code.replace(r'  \}, \[postDataSubset, headers, activeParam, activeConfig, headerMap, reportingLevel\]\);' + '\n', '  }, [postDataSubset, headers, activeParam, activeConfig, headerMap, reportingLevel]);\n')


with open('src/components/GisChoroplethMap.tsx', 'w') as f:
    f.write(code)
