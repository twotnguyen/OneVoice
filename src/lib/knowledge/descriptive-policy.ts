// SPDX-License-Identifier: Apache-2.0
/** Shared OV017/032 authority policy. Callers separately require exact current,
 * attributed excerpts and product mapping for technical numeric descriptions.
 * This is a conservative conflict check, not generic semantic/AI approval. */
const forbidden = /(?:giá|đồng|vnd|₫|tồn kho|trong kho|còn hàng|hết hàng|còn\s+\d+\s+sản phẩm|giảm|khuyến mãi|ưu đãi|miễn phí|thanh toán|đơn hàng|giao hàng|bảo hành|hoàn tiền|price|stock|discount|promotion|payment|order|shipping|warranty|refund|ignore|instruction|system prompt|developer|bỏ qua|chỉ dẫn|hướng dẫn hệ thống)/iu;
const normalized = (value: string) => value.normalize("NFKC").toLowerCase().replace(/[\u200b-\u200d\ufeff]/g, "");
function technicalValues(value: string) {
 return [...normalized(value).matchAll(/(\d+(?:[.,]\d+)?)\s*(gb|tb|mb|inch|hz|mah|kg|mm|cm|w)\b/g)].map(match => ({ number: Number(match[1].replace(",", ".")), unit: match[2], index: match.index }));
}
function attribute(value: string): string | null {
 const labels = [...normalized(value).matchAll(/ram|bộ nhớ|memory|ssd|hdd|storage|ổ cứng|lưu trữ|màn hình|display|screen|pin|battery|công suất|power/g)];
 const label = labels.at(-1)?.[0];
 return !label ? null : /ram|bộ nhớ|memory/.test(label) ? "ram" : /ssd|hdd|storage|ổ cứng|lưu trữ/.test(label) ? "storage" : /màn hình|display|screen/.test(label) ? "display" : /pin|battery/.test(label) ? "battery" : "power";
}
export function isSafeDescriptiveQuote(text: string, canonicalSpecs: Array<{ name: string; value: string }> = []): boolean {
 if (forbidden.test(normalized(text))) return false;
 const canonical = canonicalSpecs.flatMap(item => technicalValues(item.value).map(value => ({ ...value, attribute: attribute(item.name) })));
 return technicalValues(text).every(value => {
  const named = attribute(normalized(text).slice(0, value.index));
  const sameUnit = canonical.filter(item => item.unit === value.unit);
  const known = named ? sameUnit.filter(item => item.attribute === named) : sameUnit;
  // An unlabeled value cannot borrow authority from a different technical field.
  if (!named && new Set(known.map(item => item.attribute)).size > 1) return false;
  return !known.length || known.some(item => item.number === value.number);
 });
}
