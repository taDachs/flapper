export async function apiPost(path: string, body: unknown) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Request failed");
  return data;
}

export async function apiGet(path: string) {
  const res = await fetch(path, { credentials: "include" });
  if (!res.ok) throw new Error("Request failed");
  return res.json();
}
