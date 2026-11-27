type SecurityRequirement = Record<string, string[]>;
type Operation = { security?: SecurityRequirement[]; tags?: string[] };
type Specification = {
  paths?: Record<string, Record<string, Operation>>;
  security?: SecurityRequirement[];
  tags?: { name: string; description?: string }[];
};

const groups = [
  { name: 'Public · Không cần JWT', description: 'Truy cập qua gateway. VNPAY IPN vẫn yêu cầu chữ ký hợp lệ.' },
  { name: 'Public · Cần Bearer JWT', description: 'Truy cập qua gateway. Quyền STAFF và quyền sở hữu vẫn được kiểm tra theo từng API.' },
  { name: 'Nội bộ · Chỉ trong mạng Docker', description: 'Dành cho giao tiếp giữa service và kiểm tra sức khỏe. Các API service-to-service yêu cầu token nội bộ.' },
] as const;

const operations = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace']);
const internalPath = (path: string) => !path.startsWith('/api/');

function groupByVisibility(document: Specification): Specification {
  if (!document?.paths) return document;
  const used = new Set<string>();
  const paths = Object.fromEntries(Object.entries(document.paths).map(([path, item]) => [
    path,
    Object.fromEntries(Object.entries(item).map(([method, operation]) => {
      if (!operations.has(method)) return [method, operation];
      const security = operation.security ?? document.security;
      const group = internalPath(path) ? groups[2] :
        security?.some(requirement => 'bearerAuth' in requirement) ? groups[1] : groups[0];
      used.add(group.name);
      return [method, { ...operation, tags: [group.name] }];
    })),
  ]));
  return { ...document, paths, tags: groups.filter(group => used.has(group.name)) };
}

export function ApiVisibilityPlugin() {
  return {
    statePlugins: {
      spec: {
        wrapActions: {
          updateJsonSpec: (original: (document: Specification) => unknown) =>
            (document: Specification) => original(groupByVisibility(document)),
        },
        wrapSelectors: {
          allowTryItOutFor: (original: (state: unknown, path: string, method: string) => boolean) =>
            (state: unknown, path: string, method: string) => !internalPath(path) && original(state, path, method),
        },
      },
    },
  };
}
