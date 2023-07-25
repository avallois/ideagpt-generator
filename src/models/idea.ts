import { Schema, model } from "mongoose";

const ideaSchema = new Schema(
  {
    title: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    source: {
      type: String,
      required: true,
    },
    inspiration: {
      type: String,
      // required: true,
    },
    followingCount: {
      type: Number,
      default: 0,
      required: true,
    },
    permalink: {
      type: String,
      required: true,
    },
    tags: {
      type: [String],
    },
    pubDate: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

ideaSchema.index({ createdAt: -1, followingCount: -1 });
ideaSchema.index({ permalink: 1 });
ideaSchema.index({ pubDate: -1 });

const IdeaModel = model("Idea", ideaSchema);

export { IdeaModel };
