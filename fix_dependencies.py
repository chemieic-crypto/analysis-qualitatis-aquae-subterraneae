import re
with open('src/components/GisChoroplethMap.tsx', 'r') as f:
    code = f.read()

code = code.replace('  }, [metricType, activeParam]);', '  }, [metricType, activeParam, groupList]);')

with open('src/components/GisChoroplethMap.tsx', 'w') as f:
    f.write(code)
