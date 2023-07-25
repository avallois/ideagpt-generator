import { Schema, model } from "mongoose";

const tagSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
    },
    key: {
      type: String,
      unique: true,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

tagSchema.index({ key: 1 });

const TagModel = model("Tag", tagSchema);

export { TagModel };
