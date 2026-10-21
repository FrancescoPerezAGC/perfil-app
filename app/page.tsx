import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function Home() {
  const { data, error } = await supabase
    .from("perfis")
    .select("id, categoria, resposta, dicas(count)");

  if (error) return <pre>Erro: {error.message}</pre>;

  return (
    <main style={{ padding: 24 }}>
      <h1>Perfil: treino</h1>
      <ul>
        {data?.map((p) => (
          <li key={p.id}>
            {p.categoria}: {p.resposta} ({p.dicas?.[0]?.count ?? 0} dicas)
          </li>
        ))}
      </ul>
    </main>
  );
}