**Twin Mind AI Second Brain**  
      
Architecture  
Functional Requirements

1. Users should be able to upload audio files (such as .mp3, .m4a) and have the system transcribe the spoken words.  
2. Users should be able to upload document files (.pdf, .md) and have the system extract the text and relevant metadata.  
3. Users should be able to provide a URL and have the system scrape and process the main text content of a web page.  
4. Users should be able to enter plain text or notes for the system to process and store.  
5. Users should be able to upload images, which the system will store and make searchable via associated text or metadata.  
6. The system should allow a user to run the AI companion in the background during meetings. The system must continuously capture audio, transcribe it in real time or near-real time, segment the transcript, and store it as time-stamped chunks in the knowledge base for future querying.

Non-Functional Requirements

1. Low Latency: The system should have low latency (\< 5s end-to-end latency under typical network conditions).  
2. Durability: The system should be durable; the data should not be lost.  
3. Consistency Over Availability: The system should prioritize consistency over availability. The user should get up-to-date information; availability is still important but temporary downtime is often preferable to serving stale or incorrect data.

Core Entities

1. User: Who will be using this AI personal companion.  
2. Content: This represents any resource ingested by the user (documents, audio, notes, images, or web page), with which the user will interact.  
3. Query: What the user asks in natural language to get answers from the content they have uploaded.  
4. LLM Response: This represents the response, which itself is an entity that can be stored, referenced, or tied back to the query and source knowledge. Useful for user history, feedback, and system analytics.

2\. High-Level Design (HLD)

**Information Retrieval and Querying Strategy**

A Hybrid Approach combining the following:

* Semantic Search: For intent and fuzzy search.  
* Full-Text Search: For fast, reliable retrieval when users know specific terms, phrases, tags, or technical jargon.  
* Graph-Based Search: For context and time-based retrieval.

**How is raw data processed and "chunked" for indexing?**

**Ingestion and Data Processing**

* Users upload raw content (Audio, PDF, Markdown, plain text, image, or web page URL) to AWS S3, or the system captures live meeting audio in the background.  
  * Extraction is performed based on content type:  
    * **Audio / Live Meetings:** Transcribed to text via ASR (e.g., using Whisper).  
    * **PDF / Markdown / Web Pages:** Parsed for text and metadata.  
    * **Images:** Metadata and text extracted using OCR or a vision model.

* After extraction, the data is cleaned and prepared (removing formatting issues, duplicates, or irrelevant noise).  
  **Indexing**  
  Rule-based chunking: Processed data is broken into chunks using fixed chunk sizes, section boundaries, and token limits. Chunks maintain logical coherence to preserve context for future retrieval.  
  **Storing and Retrieval**  
  Chunks are converted into vector embeddings and stored in Pinecone for fast semantic searches. Associated metadata is stored in Postgres. Each chunk preserves local context and acts as a unit of retrieval, enabling both historical and real-time use.

**Indexing Technique**

* Rule-based indexing.

**Database Schema**

The design uses **Supabase (hosted Postgres)** to store metadata and Pinecone for vector embeddings. Supabase provides built-in authentication, real-time subscriptions, and Row Level Security (RLS) for enhanced data protection.

**Supabase Tables**

* Table: users
  * id: UUID, Primary key, unique ID
  * email: TEXT, Unique user email
  * name: TEXT, User display name
  * created\_at: TIMESTAMP WITH TIME ZONE

* Table: meetings (for live audio sessions)
  * id: UUID, Primary key, unique ID
  * user\_id: UUID, Foreign key → users(id)
  * title: TEXT, Meeting title/name
  * start\_time: TIMESTAMP WITH TIME ZONE, When meeting started
  * end\_time: TIMESTAMP WITH TIME ZONE, When meeting ended (NULL while active)
  * status: TEXT, Meeting status (active, completed, failed)
  * total\_duration: INTEGER, Total duration in seconds
  * metadata: JSONB, Additional meeting metadata (participants, tags, etc.)

* Table: documents
  * id: UUID, Unique document identifier
  * user\_id: UUID, Foreign key → users(id)
  * meeting\_id: UUID, Foreign key → meetings(id), NULL for uploaded files
  * title: TEXT, Document/Note title
  * source\_type: TEXT, Content type (audio, pdf, markdown)
  * source\_uri: TEXT, File path/URL (NULL for live meetings)
  * created\_at: TIMESTAMP WITH TIME ZONE, Original creation date
  * ingested\_at: TIMESTAMP WITH TIME ZONE, When added to system
  * tags: TEXT\[\], Subject tags/labels (e.g., \["meeting", "project-x"\])

* Table: chunks
  * id: UUID, Primary key, chunk ID
  * document\_id: UUID, Foreign key → documents(id)
  * chunk\_index: INTEGER, Order of chunk in document
  * chunk\_text: TEXT, Raw chunk text
  * embedding\_id: TEXT, Reference to Pinecone vector ID
  * created\_at: TIMESTAMP WITH TIME ZONE, When chunk created
  * processed\_flag: BOOLEAN, For async processing (default false)
  * metadata: JSONB, Chunk metadata (for meetings: timestamp\_start, timestamp\_end for temporal queries)
  * UNIQUE constraint on (document\_id, chunk\_index)

**Pinecone**

This stores the chunks as vector embeddings.

* id: unique identifier (reference to chunks.embedding\_id in Postgres)  
* values: the vector embedding array  
* metadata:  
  * user\_id  
  * document\_id  
  * chunk\_index  
  * source\_type  
  * created\_at (timestamp)  
  * ingested\_at (timestamp)  
  * tags (e.g., \["meeting", "Kafka"\])  
  * title

**What are the trade-offs of your chosen storage solution (e.g., SQL vs. NoSQL vs. Vector DB) in terms of scalability, cost, and query flexibility?**

By using **Supabase (hosted Postgres)** alongside a Vector DB (Pinecone), my design achieves strong separation of concerns and high scalability. Supabase provides:
* Structured metadata storage with full Postgres capabilities
* Complex filtering and relational queries
* Built-in authentication and Row Level Security (RLS)
* Real-time subscriptions for live meeting transcription
* Auto-scaling infrastructure
* Robust data integrity for thousands of documents per user

Pinecone handles high-dimensional semantic search at scale, making it ideal for AI-driven retrieval and similarity queries across large datasets.

The trade-off is that maintaining both Supabase and Pinecone systems incurs slightly higher operational costs and architectural complexity compared to a single NoSQL or SQL-only solution. However, the performance, scaling, and query flexibility benefits are significant: Supabase delivers efficient joins, time-based filtering, and real-time capabilities, while Pinecone powers fast, accurate semantic search. This hybrid approach combines best-in-class features from both worlds, ensuring modern AI and retrieval workloads are handled efficiently without compromise.

4\. **Temporal Querying Support**

* Timestamps: Each document and chunk is tagged with precise created\_at and ingested\_at timestamps (TIMESTAMP WITH TIME ZONE) in both Supabase and Pinecone metadata.
* Meeting Chunks: For live meetings, chunks include timestamp\_start and timestamp\_end in metadata for precise temporal queries within a meeting.
* Retrieval Strategy: Time-based queries filter data using these timestamps, enabling direct retrieval or semantic search of all work performed within any specified time window, such as "last month" or "during yesterday's meeting."

**5\. Scalability and Privacy**

My design handles thousands of documents for a single user by:

* Storing user content in AWS S3 (or Supabase Storage), which supports unlimited data growth, high user concurrency, and built-in replication/backups.
* Managing metadata and content chunks in **Supabase** (auto-scaling Postgres) and **Pinecone** databases, ensuring fast, reliable retrieval and semantic search even as data size grows.
* Leveraging Supabase's connection pooling and serverless architecture for optimal performance under load.

Privacy by Design

* Cloud-Hosted Solution (Default): Offers enterprise-grade scalability and security:
  * **Supabase**: Built-in Row Level Security (RLS), encryption at rest and in transit, strict user-based access controls
  * **Pinecone**: Isolated namespace per user for data segregation
  * Seamless access from any device
  * All data records carry precise timestamps for auditability
* Local-First Option (Trade-off): For highly sensitive data, local caching and selective data residency is supported. Users can pin private documents locally or choose to keep only low-sensitivity items in the cloud.

            

                 

                               

   

          
              
            

      
          
         
                  
              