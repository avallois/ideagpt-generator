import dotenv from "dotenv";
dotenv.config();

import { connectMongoDB, disconnectMongoDB } from "./services/mongo";
import { IdeaModel } from "./models/idea";

import { z } from "zod";
import { PromptTemplate } from "langchain/prompts";
import { StructuredOutputParser } from "langchain/output_parsers";
import { ChatOpenAI } from "langchain/chat_models/openai";
import { LLMChain } from "langchain/chains";
import { TokenTextSplitter } from "langchain/text_splitter";
import Parser from "rss-parser";
import _ from "lodash";
import { nanoid } from "nanoid";
import { TagModel } from "./models/tag";
import { SourceModel } from "./models/source";

async function generateIdeas(inspiration: string, tags: string[]) {
  const model = new ChatOpenAI({
    modelName: "gpt-3.5-turbo-16k" /*"gpt-4",*/,
    temperature: 0.9,
    openAIApiKey: process.env.OPENAI_API_KEY,
  });

  const outputParser = StructuredOutputParser.fromZodSchema(
    z.object({
      ideas: z
        .array(
          z.object({
            title: z.string().describe("business/product idea title."),
            description: z
              .string()
              .describe(
                "description of the business/product MVP (Minimum Valuable Product)."
              ),
            tags: z
              .array(z.string())
              .describe("Tags from the TAGSLIST to categorizes the idea."),
          })
        )
        .describe("business/product ideas."),
    })
  );

  const formatInstructions = outputParser.getFormatInstructions();

  // Don't quote explicitly in the description and title of an idea any brand or news or what it is inspired by.
  const template = `You generate a list of new business/product ideas for an entrepreneur that can realize any project.
Every idea must be directly inspired by the Article and cannot be generic or copy the product from the Article. Ideas must be new, creative, innovative, and never seen before. Consider the themes of both articles and feel free to combine these for new ideas.
TAGSLIST: [{tags}]

{output_format}

Article:
{article}

Please generate {number_of_ideas_per_inspiration} ideas, each strictly based on the contents of the articles and potentially combining elements from both:`;

  const prompt = new PromptTemplate({
    template,
    inputVariables: ["number_of_ideas_per_inspiration", "article", "tags"],
    partialVariables: { output_format: formatInstructions },
  });

  const chain = new LLMChain({
    llm: model,
    prompt,
  });

  const response = await chain.call({
    number_of_ideas_per_inspiration: String(60),
    article: inspiration,
    tags,
  });

  const completion = await outputParser.parse(response.text);

  return completion.ideas;
}

interface IGetInspiration {
  feedLink?: string;
  fromDate?: Date;
  tokensPerInspiration: number;
}

async function getInspirations({
  feedLink,
  fromDate,
  tokensPerInspiration,
}: IGetInspiration) {
  if (!feedLink) return [];

  console.log("feedlink ok");
  let parser = new Parser();

  const feed = await parser.parseURL(feedLink);
  console.log("feed", feed ? "yes" : "no");

  const splitter = new TokenTextSplitter({
    encodingName: "cl100k_base",
    chunkSize: tokensPerInspiration,
    chunkOverlap: 0,
  });

  let inspirations: any = [];
  if (feed?.items) {
    inspirations = (
      await Promise.all(
        feed.items.map(async (item) => {
          if (fromDate && fromDate < new Date(item.isoDate as string)) {
            // const contentText = (
            //   await splitter.splitText(convert(item["content:encoded"]))
            // )[0];
            const contentText = (
              await splitter.splitText(item.contentSnippet || "")
            )[0];
            return {
              ...item,
              contentText,
            };
          }
          return null;
        })
      )
    ).filter((x) => x !== null);

    console.log("I got the inspirations !");
    inspirations.sort((a: any, b: any) => {
      const dateA = new Date(a.isoDate);
      const dateB = new Date(b.isoDate);
      return dateB.getTime() - dateA.getTime();
    });
    console.log("sort inspirations by date");
  }

  return inspirations;
}

function tagKeyToName(key: string) {
  let array = key.split("_");
  array = array.map((str) => {
    str = str.charAt(0).toUpperCase() + str.slice(1);
    return str;
  });

  return array.join(" ");
}

async function getNewIdeas() {
  //get the source of inspiration
  const source = await SourceModel.findOne({ key: "techcrunch" });
  if (!source) return [];

  //get inspirations from the source from after a specified date
  console.log("------ get inspirations");
  const inspirations = await getInspirations({
    feedLink: source.feedLink,
    fromDate: source.lastInspirationDate,
    tokensPerInspiration: 1000,
  });

  console.log("got the inspirations", inspirations.length ? "yes" : "no");
  if (!inspirations.length) return [];
  //get the tags available to categorize the ideas once generated
  const tags = (await TagModel.find().lean()).map((tag) => tag.key);

  //generate the ideas based on the inspiration contents
  console.log("------ generateIdeas... can take up to a few minutes");
  let ideas = await Promise.allSettled(
    inspirations.map(async (inspiration: any) => {
      const generatedIdeas = (
        await generateIdeas(inspiration.contentText, tags)
      ).map((idea) => {
        return {
          ...idea,
          source: inspiration.link,
          inspiration: inspiration.contentText,
          permalink: nanoid(),
        };
      });
      return generatedIdeas;
    })
  );

  ideas = ideas
    .filter((result) => result.status === "fulfilled")
    .map((result: any) => result.value)
    .flat();

  console.log("I have the ideas");

  const newTags: any[] = [];
  ideas.forEach((idea: any) => {
    idea.tags.forEach((tag: any) => {
      if (
        !tags.includes(tag) &&
        !newTags.some((newTag: any) => newTag.key === tag)
      ) {
        newTags.push({
          name: tagKeyToName(tag),
          key: tag,
        });
      }
    });
  });

  await TagModel.insertMany(newTags);

  await SourceModel.updateOne(
    { key: "techcrunch" },
    { $set: { lastInspirationDate: new Date(inspirations[0].isoDate) } }
  );

  return ideas;
}

interface ISetPubDates {
  fromDate: Date;
  ideas: any[];
}

function setPubDates({ fromDate, ideas }: ISetPubDates) {
  let nextPubDate = fromDate;
  nextPubDate.setSeconds(0);
  nextPubDate.setMilliseconds(0);

  // get next date from now where the minutes are a multiple of 5
  if (nextPubDate.getMinutes() % 5 === 0) {
    nextPubDate.setMinutes(nextPubDate.getMinutes() + 5);
  } else {
    while (nextPubDate.getMinutes() % 5 !== 0) {
      nextPubDate.setMinutes(nextPubDate.getMinutes() + 1);
    }
  }

  for (const idea of ideas) {
    idea.pubDate = new Date(nextPubDate);
    nextPubDate.setMinutes(nextPubDate.getMinutes() + 5);
  }
}

async function main() {
  console.log("-------- ", new Date());
  console.log("start");

  try {
    await connectMongoDB();

    const safeFuturePubCount = 576; //2 days of ideas when publishing every 5 mins
    //get the count of future publications from now
    const futurePubCount = await IdeaModel.countDocuments({
      pubDate: { $gte: new Date() },
    });

    console.log(
      "futurePubCount < safeFuturePubCount",
      futurePubCount,
      "<",
      safeFuturePubCount
    );
    //if the count of future publications is lower than the safe count
    if (futurePubCount < safeFuturePubCount) {
      //generate new ideas
      const ideas: any = await getNewIdeas();

      console.log("new ideas length", ideas?.length);
      if (ideas?.length) {
        //get the furthest future publication to calculate from which date we should planify the new publications
        const furthestFuturePub = await IdeaModel.findOne(
          {
            pubDate: { $gte: new Date() },
          },
          { pubDate: 1 }
        )
          .sort({ pubDate: -1 })
          .limit(1);

        //planify the new publications
        if (futurePubCount && furthestFuturePub?.pubDate) {
          console.log(
            "set the date from furthestFuturePub.pubDate:",
            furthestFuturePub.pubDate
          );
          setPubDates({ fromDate: new Date(furthestFuturePub.pubDate), ideas });
        } else {
          console.log("set the date from now:", new Date());
          setPubDates({ fromDate: new Date(), ideas });
        }

        await IdeaModel.insertMany(ideas);
        console.log("ideas inserted");
      }
    }

    await disconnectMongoDB();
    console.log("done");
  } catch (error) {
    console.log("ERROR----------------");
    console.log(error);
  }
}

main();
