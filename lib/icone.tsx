import { ImageResponse } from "next/og";

export function gerarIcone(tamanho: number) {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#1e3a5f",
          color: "#ffffff",
          fontSize: tamanho * 0.6,
          fontWeight: 700,
        }}
      >
        ?
      </div>
    ),
    { width: tamanho, height: tamanho }
  );
}