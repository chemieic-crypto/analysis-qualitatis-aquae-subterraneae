with open('src/components/GisChoroplethMap.tsx', 'r') as f:
    code = f.read()

bad_string = r'  const groupListPost = useMemo\(\(\) => \{\n    return computeGroupList\(postDataSubset\);\n  \}, \[postDataSubset, headers, activeParam, activeConfig, headerMap, reportingLevel\]\);'

good_string = '''  const groupListPost = useMemo(() => {
    return computeGroupList(postDataSubset);
  }, [postDataSubset, headers, activeParam, activeConfig, headerMap, reportingLevel]);'''

code = code.replace(bad_string, good_string)

with open('src/components/GisChoroplethMap.tsx', 'w') as f:
    f.write(code)
