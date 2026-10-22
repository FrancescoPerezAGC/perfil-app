"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type Tentativa = {
  perfil_id: string;
  dicas_usadas: number;
  acertou: boolean;
  pontos: number;
  criado_em: string;
  perfis: { categoria: string; resposta: string } | null;
};

const soma = (n: number[]) => n.reduce((a, b) => a + b, 0);
const media = (n: number[]) => (n.length ? soma(n) / n.length : 0);
const pct = (a: number, b: number) => (b ? Math.round((a * 100) / b) : 0);
const dia = (iso: string) => new Date(iso).toLocaleDateString("sv-SE");

const card: React.CSSProperties = {
  border: "1px solid #ddd",
  borderRadius: 8,
  padding: 12,
  flex: 1,
  minWidth: 130,
};

export default function Estatisticas() {
  const [dados, setDados] = useState<Tentativa[] | null>(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("tentativas")
        .select("perfil_id, dicas_usadas, acertou, pontos, criado_em, perfis(categoria, resposta)")
        .order("criado_em", { ascending: false })
        .limit(1000);
      if (error) return setErro(error.message);
      setDados((data ?? []) as unknown as Tentativa[]);
    })();
  }, []);

  if (erro) return <pre style={{ padding: 24 }}>Erro: {erro}</pre>;
  if (!dados) return <p style={{ padding: 24 }}>Carregando...</p>;

  const voltar = (
    <p>
      <Link href="/">← Voltar ao jogo</Link>
    </p>
  );

  if (dados.length === 0) {
    return (
      <main style={{ maxWidth: 520, margin: "0 auto", padding: 20, fontFamily: "system-ui" }}>
        {voltar}
        <h1>Estatísticas</h1>
        <p>Ainda não há rodadas. Jogue algumas e volte aqui.</p>
      </main>
    );
  }

  // resumo geral
  const acertos = dados.filter((t) => t.acertou);
  const mediaDicas = media(acertos.map((t) => t.dicas_usadas));

  // por categoria
  const cats = ["pessoa", "lugar", "coisa", "ano"].map((c) => {
    const ts = dados.filter((t) => t.perfis?.categoria === c);
    const ac = ts.filter((t) => t.acertou);
    return {
      nome: c,
      rodadas: ts.length,
      taxa: pct(ac.length, ts.length),
      dicas: media(ac.map((t) => t.dicas_usadas)),
    };
  });

  // pontos dos últimos 7 dias
  const dias = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const chave = d.toLocaleDateString("sv-SE");
    return {
      chave,
      rotulo: `${chave.slice(8)}/${chave.slice(5, 7)}`,
      pontos: soma(dados.filter((t) => dia(t.criado_em) === chave).map((t) => t.pontos)),
    };
  });
  const maxPontos = Math.max(...dias.map((d) => d.pontos), 1);

  // perfis mais difíceis
  const porPerfil: Record<
    string,
    { resposta: string; rodadas: number; erros: number; dicasAcertos: number[] }
  > = {};
  dados.forEach((t) => {
    const p = (porPerfil[t.perfil_id] ??= {
      resposta: t.perfis?.resposta ?? "?",
      rodadas: 0,
      erros: 0,
      dicasAcertos: [],
    });
    p.rodadas += 1;
    if (t.acertou) p.dicasAcertos.push(t.dicas_usadas);
    else p.erros += 1;
  });
  const dificeis = Object.values(porPerfil)
    .sort((a, b) => b.erros - a.erros || media(b.dicasAcertos) - media(a.dicasAcertos))
    .slice(0, 5);

  return (
    <main style={{ maxWidth: 520, margin: "0 auto", padding: 20, fontFamily: "system-ui" }}>
      {voltar}
      <h1>Estatísticas</h1>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <div style={card}>
          <div style={{ fontSize: 13, color: "#555" }}>Rodadas</div>
          <b style={{ fontSize: 24 }}>{dados.length}</b>
        </div>
        <div style={card}>
          <div style={{ fontSize: 13, color: "#555" }}>Taxa de acerto</div>
          <b style={{ fontSize: 24 }}>{pct(acertos.length, dados.length)}%</b>
        </div>
        <div style={card}>
          <div style={{ fontSize: 13, color: "#555" }}>Dicas por acerto</div>
          <b style={{ fontSize: 24 }}>{mediaDicas.toFixed(1)}</b>
        </div>
        <div style={card}>
          <div style={{ fontSize: 13, color: "#555" }}>Pontos totais</div>
          <b style={{ fontSize: 24 }}>{soma(dados.map((t) => t.pontos))}</b>
        </div>
      </div>

      <h2>Por categoria</h2>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ textAlign: "left", fontSize: 14, color: "#555" }}>
            <th>Categoria</th>
            <th>Rodadas</th>
            <th>Acerto</th>
            <th>Dicas</th>
          </tr>
        </thead>
        <tbody>
          {cats.map((c) => (
            <tr key={c.nome} style={{ borderTop: "1px solid #eee" }}>
              <td style={{ textTransform: "capitalize", padding: "8px 0" }}>{c.nome}</td>
              <td>{c.rodadas}</td>
              <td>{c.rodadas ? `${c.taxa}%` : "-"}</td>
              <td>{c.dicas ? c.dicas.toFixed(1) : "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Pontos nos últimos 7 dias</h2>
      {dias.map((d) => (
        <div key={d.chave} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <span style={{ width: 48, fontSize: 14 }}>{d.rotulo}</span>
          <div style={{ flex: 1, background: "#eee", borderRadius: 4, height: 18 }}>
            <div
              style={{
                width: `${(d.pontos / maxPontos) * 100}%`,
                background: "#1e3a5f",
                height: "100%",
                borderRadius: 4,
              }}
            />
          </div>
          <span style={{ width: 36, textAlign: "right", fontSize: 14 }}>{d.pontos}</span>
        </div>
      ))}

      <h2>Perfis mais difíceis</h2>
      <ol style={{ paddingLeft: 20, lineHeight: 1.6 }}>
        {dificeis.map((p) => (
          <li key={p.resposta}>
            <b>{p.resposta}</b>: {p.erros} {p.erros === 1 ? "erro" : "erros"} em {p.rodadas}{" "}
            {p.rodadas === 1 ? "rodada" : "rodadas"}
            {p.dicasAcertos.length > 0 && ` · média de ${media(p.dicasAcertos).toFixed(1)} dicas nos acertos`}
          </li>
        ))}
      </ol>
    </main>
  );
}