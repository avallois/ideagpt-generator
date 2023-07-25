import { connect, connection } from "mongoose";

connection.on("error", (error) => {
  console.error("MongoDB Error connection:", error);
});

connection.once("open", () => {
  console.log("MongoDB Connected:", connection.host);
});

connection.on("disconnected", () => {
  console.error("MongoDB Disconnected");
});

const connectMongoDB = async () => {
  console.log("mongooooo link: ", String(process.env.MONGO_DB_URL));
  await connect(String(process.env.MONGO_DB_URL), {});
};

const disconnectMongoDB = async () => connection.close();

export { connectMongoDB, disconnectMongoDB };
