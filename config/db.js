const mongoose = require("mongoose");

const connectDB = async () => {
  console.log("Mencoba connect ke MongoDB Atlasss...");

  mongoose.connection.on("connected", () => {
    console.log("MongoDB CONNECTED BERHASIL!");
  });

  mongoose.connection.on("error", (err) => {
    console.error("MongoDB CONNECTION ERROR:", err.message);
  });

  mongoose.connection.on("disconnected", () => {
    console.log("MongoDB DISCONNECTED");
  });

  try {
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 15000,
      family: 4,
      tls: true,
      retryWrites: true,
    });

    console.log(`MongoDB Connected: ${mongoose.connection.host}`);
  } catch (error) {
    console.error("KONEKSI GAGAL TOTAL!");
    console.error("Error:", error.message);
    console.error(
      "MONGO_URI kamu:",
      process.env.MONGO_URI.replace(/:.*@/, ":***@"),
    );
    process.exit(1);
  }
};

module.exports = connectDB;
