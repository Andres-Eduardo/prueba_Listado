const express = require("express");
const path = require("path");
const { MongoClient } = require("mongodb");

const app = express();
const PORT = process.env.PORT || 3000;

// --- CONFIGURACIÓN DE GOOGLE SHEETS (MAESTRO) ---
const SHEET_PUB_ID =
  "2PACX-1vQ4ALbvBMyDsNNgCYisVnZ3ul6ij44CXv7aHQbo9OV4yBP3oKyt1aUTJZY8GCZKRtgSBAJKBwSWiHy-";
const SHEET_GIDS = {
  Lunes: "0",
  Martes: "1223082696",
  Miercoles: "113785064",
  Jueves: "1385009126",
  Viernes: "1138108128",
};

// --- CONFIGURACIÓN MONGODB ---
// La URI la obtienes de MongoDB Atlas. En Render la pondrás como Variable de Entorno.
const uri = process.env.MONGO_URI;
const client = new MongoClient(uri);
let db;

async function connectDB() {
  try {
    await client.connect();
    db = client.db("sistemas_asistencias"); // Nombre de la base de datos
    const collection = db.collection("registros");
    await collection.createIndex({ documento: 1 });
    await collection.createIndex({ fecha: 1 });
    await collection.createIndex({ loteId: 1 });

    console.log("🍃 Conexión exitosa a MongoDB Atlas");
  } catch (e) {
    console.error("❌ Error conectando a MongoDB:", e);
    process.exit(1);
  }
}

// --- MIDDLEWARES ---
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json({ limit: "50mb" })); // Aumentamos límite para recibir listados grandes

// --- RUTAS DE LA API (MONGODB) ---

// 1. Guardar asistencia en la nube
app.post("/api/historico/guardar", async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({ error: "DB no disponible" });
    }

    const { datos } = req.body;

    if (!datos || !Array.isArray(datos)) {
      return res.status(400).json({ error: "Formato inválido" });
    }

    const loteId = new Date().toISOString();

    const datosLimpios = datos
      .filter((d) => d.nombre && d.documento && d.fecha)
      .map((d) => ({
        nombre: d.nombre.trim(),
        documento: String(d.documento),
        fecha: d.fecha,
        dia: d.dia || "",
        asistencia: Boolean(d.asistencia),
        programa: d.programa || "CIDI",
        loteId,
        createdAt: new Date(),
      }));

    const collection = db.collection("registros");

    await collection.insertMany(datosLimpios, { ordered: false });

    res.json({
      mensaje: "Datos guardados",
      total: datosLimpios.length,
      loteId,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al guardar datos" });
  }
});

// 2. Obtener todo el histórico para el Dashboard
app.get("/api/historico", async (req, res) => {
  try {
    const collection = db.collection("registros");
    const limit = parseInt(req.query.limit) || 500;
    // Traemos todos los registros, ordenados por fecha descendente
    const registros = await collection
      .find({})
      .sort({ fecha: -1 })
      .limit(limit)
      .toArray();
    res.json(registros);
  } catch (err) {
    res.status(500).json({ error: "Error al obtener datos de la nube" });
  }
});

// --- RUTAS DE GOOGLE SHEETS (LISTADO) ---
app.get("/api/sheet/:dia", async (req, res) => {
  const dia = req.params.dia;
  const gid = SHEET_GIDS[dia];
  if (!gid) return res.status(404).json({ error: `Día no encontrado: ${dia}` });

  const url = `https://docs.google.com/spreadsheets/d/e/${SHEET_PUB_ID}/pub?gid=${gid}&single=true&output=csv`;

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Google respondió ${response.status}`);
    const csv = await response.text();
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: "Error cargando listado maestro" });
  }
});

app.get("/api/dias", (req, res) => {
  res.json({ dias: Object.keys(SHEET_GIDS) });
});

// --- RUTAS DE NAVEGACIÓN ---
app.get("/dashboard", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "dashboard.html"));
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// --- ARRANCAR SERVIDOR ---
async function startServer() {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
  });
}

startServer();
