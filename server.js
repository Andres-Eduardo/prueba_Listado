const express = require("express");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

const SHEET_PUB_ID =
  "2PACX-1vQ4ALbvBMyDsNNgCYisVnZ3ul6ij44CXv7aHQbo9OV4yBP3oKyt1aUTJZY8GCZKRtgSBAJKBwSWiHy-";

const SHEET_GIDS = {
  Lunes: "0",
  Martes: "1223082696",
  Miercoles: "113785064",
  Jueves: "1385009126",
  Viernes: "1138108128",
};

const HISTORICO_DIR = path.join(__dirname, "historico");
if (!fs.existsSync(HISTORICO_DIR)) fs.mkdirSync(HISTORICO_DIR);

app.use(express.static(path.join(__dirname, "public")));
app.use(express.json({ limit: "10mb" }));

app.get("/dashboard", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "dashboard.html"));
});

app.get("/api/sheet/:dia", async (req, res) => {
  const dia = req.params.dia;
  const gid = SHEET_GIDS[dia];
  if (!gid) return res.status(404).json({ error: `Dia no encontrado: ${dia}` });
  const url = `https://docs.google.com/spreadsheets/d/e/${SHEET_PUB_ID}/pub?gid=${gid}&single=true&output=csv`;
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Google respondio ${response.status}`);
    const csv = await response.text();
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");
    res.send(csv);
  } catch (err) {
    console.error(`Error cargando ${dia}:`, err.message);
    res.status(500).json({ error: "No se pudo cargar el listado" });
  }
});

app.post("/api/historico/guardar", (req, res) => {
  try {
    const { nombre, datos } = req.body;
    if (!nombre || !datos)
      return res.status(400).json({ error: "Faltan datos" });
    const filePath = path.join(HISTORICO_DIR, nombre);
    const buffer = Buffer.from(datos, "base64");
    fs.writeFileSync(filePath, buffer);
    console.log(`Guardado en historico: ${nombre}`);
    res.json({ ok: true, archivo: nombre });
  } catch (err) {
    res.status(500).json({ error: "No se pudo guardar" });
  }
});

app.get("/api/historico", (req, res) => {
  try {
    const archivos = fs
      .readdirSync(HISTORICO_DIR)
      .filter((f) => f.endsWith(".xlsx"))
      .sort()
      .map((f) => ({
        nombre: f,
        url: `/api/historico/${f}`,
        fecha: fs.statSync(path.join(HISTORICO_DIR, f)).mtime,
      }));
    res.json({ archivos });
  } catch (err) {
    res.status(500).json({ error: "Error listando historico" });
  }
});

app.get("/api/historico/:nombre", (req, res) => {
  const filePath = path.join(HISTORICO_DIR, req.params.nombre);
  if (!fs.existsSync(filePath))
    return res.status(404).json({ error: "No encontrado" });
  res.download(filePath);
});

app.get("/api/dias", (req, res) => {
  res.json({ dias: Object.keys(SHEET_GIDS) });
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Servidor CIDI corriendo en puerto ${PORT}`);
});
