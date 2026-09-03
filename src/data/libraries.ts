export type Library = {
  id: string;
  name: string;
  description: string;
  platforms: string[];
  repo: string;
  article?: string;
  order?: number;
};

export const libraries: Library[] = [
  {
    id: "nested-paging",
    name: "NestedPaging",
    description:
      "UIKit 嵌套滚动容器：封面收起、分类栏吸顶，底下多个列表既能自己滚，也能左右换页。",
    platforms: ["UIKit", "Swift"],
    repo: "https://github.com/shenxiang11/NestedPaging",
    article: "posts/nested-paging-offset-locking",
    order: 1,
  },
];

export function getSortedLibraries() {
  return [...libraries].sort((a, b) => {
    const orderA = a.order ?? Number.MAX_SAFE_INTEGER;
    const orderB = b.order ?? Number.MAX_SAFE_INTEGER;
    return orderA - orderB;
  });
}
