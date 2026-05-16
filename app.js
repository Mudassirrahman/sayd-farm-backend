const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const connectDB = require("./config/db");

// Import Routes
const authRoutes = require("./routes/authRoutes");
const expenseRoutes = require("./routes/expenseRoutes");
const userRoutes = require("./routes/userRoutes");
const advanceRoutes = require("./routes/advanceRoutes");
const categoryRoutes = require("./routes/categoryRoutes");
const taskRoutes = require("./routes/taskRoutes");
const landBlockRoutes = require("./routes/landBlockRoutes");
const inventoryCategoryRoutes = require("./routes/inventoryCategoryRoutes");
const inventoryRoutes = require("./routes/inventoryRoutes");
const irrigationRoutes = require("./routes/irrigationRoutes");

const app = express();

// Load environment variables 
dotenv.config();

// Connect to MongoDB 
connectDB();

// Middlewares
app.use(
  cors({
    origin: [
      "https://syed-farm-frontend.vercel.app",
      "http://localhost:3000",
      "http://localhost:5173",
      "http://localhost:5174",
    ],
    credentials: true,
  }),
);
app.use(express.json());

// Routes
app.use("/auth", authRoutes);
app.use("/users", userRoutes);
app.use("/expenses", expenseRoutes);
app.use("/advances", advanceRoutes);
app.use("/categories", categoryRoutes);
app.use("/tasks", taskRoutes);
app.use("/land-blocks", landBlockRoutes);
app.use("/inventory-categories", inventoryCategoryRoutes);
app.use("/inventory", inventoryRoutes);
app.use("/irrigations", irrigationRoutes);

// Default route
app.get("/", (req, res) => {
  res.send(" App  is running...");
});

// Server (for local development)
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Export for Vercel serverless
//  module.exports = app;
