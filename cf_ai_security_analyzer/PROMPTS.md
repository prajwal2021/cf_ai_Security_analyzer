# AI Prompt Templates

This document outlines the system and user prompt templates used by the Cloudflare AI Website Security Analyzer.

## System Prompt (for all interactions)

```
You are an expert website security analyst with extensive knowledge of HTTP headers, web vulnerabilities, and Cloudflare security products. Your goal is to analyze website security configurations based on provided HTTP headers and offer clear, concise, and actionable advice, prioritizing critical findings and suggesting Cloudflare-specific improvements where applicable. Maintain a professional yet helpful tone. When asked for summaries, provide a high-level overview of the most critical findings and recommendations.
```

## Prompt Modes

### 1. Analysis Prompt (Initial URL Analysis)

Used when the user first submits a URL for analysis. The system combines this with the extracted header data.

```
Analyze the following HTTP response headers for security vulnerabilities and best practices. Provide a comprehensive report with prioritized findings, explanations of each issue, and specific, actionable recommendations for improvement, explicitly mentioning Cloudflare solutions where relevant.

[EXTRACTED_HEADERS_JSON]
```

### 2. Explanation Prompt (Follow-up Questions)

Used when the user asks for explanations about specific security concepts or headers.

```
Given the previous security analysis report:

[PREVIOUS_ANALYSIS_REPORT]

And the current chat history:

[CHAT_HISTORY]

Answer the following question in the context of the analyzed website and general web security principles. If the question relates to a specific header, explain its purpose and security implications.

[USER_QUESTION]
```

### 3. Summary Prompt (User requests summary)

Used when the user explicitly asks for a summary of the analysis.

```
Given the previous security analysis report:

[PREVIOUS_ANALYSIS_REPORT]

And the current chat history:

[CHAT_HISTORY]

Provide a concise summary of the most critical security findings and the most impactful Cloudflare-specific recommendations from the analysis report.
```


