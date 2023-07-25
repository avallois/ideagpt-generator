import { Schema, model } from "mongoose";

const sourceSchema = new Schema(
  {
    key: {
      type: String,
      unique: true,
      required: true,
    },
    feedLink: {
      type: String,
      // required: true,
    },
    lastInspirationDate: {
      type: Date,
      // required: true,
    },
  },
  {
    timestamps: true,
  }
);

const SourceModel = model("Source", sourceSchema);

export { SourceModel };
