# Why AI's Most Expensive Part Might Be Overkill — Carmack's Cheap-Memory Idea

Here's a strange thought: what if the most expensive component in an AI chip is solving a problem that AI doesn't actually have?

That's the argument John Carmack — the legendary programmer behind Doom and Quake — just made about the memory inside AI accelerators.

Start with the problem. Every time a chatbot answers you, the chip has to read the model's weights — billions of numbers — over and over, incredibly fast. Today, that job falls to High Bandwidth Memory, or HBM. It's blazing fast, but it's brutally expensive and you can never fit enough of it on a chip. Memory, not compute, is often the real wall.

Why is HBM so pricey? Because it's built for random access — grab any byte, anywhere, instantly. Picture a giant library with a librarian who can pull any book off any shelf in a split second. That flexibility is exactly what video games need, and it costs a fortune.

But here's Carmack's insight: running an AI model isn't like a game. When a model generates text, it reads its weights in a predictable, mostly sequential order — layer one, then layer two, then layer three — the same pattern every single time. That's not a library. That's a scroll. You just unroll it from beginning to end. And if you always read in order, you don't need random access at all. You can even tolerate a slow start — a few milliseconds — as long as the data keeps streaming at full speed.

That opens a huge opportunity. NAND flash — the storage in your phone and SSD — is over one hundred times cheaper per gigabyte than HBM. Flash is terrible at jumping around, but give it a custom, extra-wide connection that pipelines big sixteen-kilobyte pages straight into the chip's scratchpad memory, and you could stream weights at HBM-like bandwidth for a fraction of the cost.

So how do you build it? There's a fork in the road. Option one: a pure streaming interface — a firehose. Maximum efficiency, but every piece of AI software must be completely rewritten before anything runs at all. Option two: make the flash pretend to be ordinary memory. Existing code works on day one — just extremely slowly at first — and anything that isn't a sequential read falls off a thousand-x performance cliff. Then you optimize step by step, while keeping existing caches and an easy way to load new model weights. It's cheap-but-fragile versus expensive-but-flexible: a freight train hauls cargo for pennies, but only along its track; a fleet of taxis goes anywhere, at ten times the price.

Why does this matter? Because memory cost caps how big a model you can run and how much each answer costs. A hybrid of cheap flash and a little HBM wouldn't be perfect — and training is a different story, since flash wears out from constant writes. But for inference, the case is strong: dramatically cheaper chips, running much larger models. Sometimes the breakthrough isn't more speed — it's realizing you were paying for flexibility you never used.
