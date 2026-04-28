Источник: karipos (id=87709deb-913d-4cce-88d1-8573837dcc3b)
Кандидатов с NULL summary (source_type=code): 15289
--- Dry-run оценка ---
Модель: Qwen/Qwen2.5-7B-Instruct
Параметры стоимости: avgTokensPerChunk=200, pricePerTokenUsd=5.0000000000000004e-8
Выборка для skip-rate: 500 чанков
Skip-rate (Gate 1+2): 34.8%
Ожидаемое число LLM-вызовов: 9968
Ожидаемое число токенов: 1,993,600
Оценка стоимости: $0.100
Референс KariPos (~18K чанков, Qwen2.5-7B): $0.30–$0.70
Запросы к провайдеру НЕ отправлялись.
Источник: karipos (id=87709deb-913d-4cce-88d1-8573837dcc3b)
Кандидатов с NULL summary (source_type=code): 15289
[OpenAITextEmbedder] Response validated: 31 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=31, skipped=19, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 50/200: ok=31, skipped=19, failed=0
[OpenAITextEmbedder] Response validated: 35 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=35, skipped=15, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 100/200: ok=66, skipped=34, failed=0
[OpenAITextEmbedder] Response validated: 30 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=30, skipped=20, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 150/200: ok=96, skipped=54, failed=0
[OpenAITextEmbedder] Response validated: 30 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=30, skipped=20, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 200/200: ok=126, skipped=74, failed=0

Завершено. Обработано=200, summarized=126, skipped=74, failed=0
Источник: karipos (id=87709deb-913d-4cce-88d1-8573837dcc3b)
Кандидатов с NULL summary (source_type=code): 15089
[OpenAITextEmbedder] Response validated: 28 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=28, skipped=22, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 50/15089: ok=28, skipped=22, failed=0
[OpenAITextEmbedder] Response validated: 28 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=28, skipped=22, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 100/15089: ok=56, skipped=44, failed=0
[SiliconFlowSummarizer] request failed: The operation was aborted due to timeout
[FIX] marking 1 failed rows with [failed:*] placeholder to prevent infinite retry loop
[OpenAITextEmbedder] Response validated: 37 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=37, skipped=12, failed=1)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 150/15089: ok=93, skipped=56, failed=1
[OpenAITextEmbedder] Response validated: 34 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=34, skipped=16, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 200/15089: ok=127, skipped=72, failed=1
[OpenAITextEmbedder] Response validated: 38 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=38, skipped=12, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 250/15089: ok=165, skipped=84, failed=1
[OpenAITextEmbedder] Response validated: 34 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=34, skipped=16, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 300/15089: ok=199, skipped=100, failed=1
[OpenAITextEmbedder] Response validated: 34 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=34, skipped=16, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 350/15089: ok=233, skipped=116, failed=1
[OpenAITextEmbedder] Response validated: 33 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=33, skipped=17, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 400/15089: ok=266, skipped=133, failed=1
[OpenAITextEmbedder] Response validated: 38 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=38, skipped=12, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 450/15089: ok=304, skipped=145, failed=1
[OpenAITextEmbedder] Response validated: 33 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=33, skipped=17, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 500/15089: ok=337, skipped=162, failed=1
[OpenAITextEmbedder] Response validated: 29 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=29, skipped=21, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 550/15089: ok=366, skipped=183, failed=1
[OpenAITextEmbedder] Response validated: 34 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=34, skipped=16, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 600/15089: ok=400, skipped=199, failed=1
[OpenAITextEmbedder] Response validated: 33 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=33, skipped=17, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 650/15089: ok=433, skipped=216, failed=1
[OpenAITextEmbedder] Response validated: 30 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=30, skipped=20, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 700/15089: ok=463, skipped=236, failed=1
[OpenAITextEmbedder] Response validated: 33 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=33, skipped=17, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 750/15089: ok=496, skipped=253, failed=1
[OpenAITextEmbedder] Response validated: 34 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=34, skipped=16, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 800/15089: ok=530, skipped=269, failed=1
[OpenAITextEmbedder] Response validated: 31 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=31, skipped=19, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 850/15089: ok=561, skipped=288, failed=1
[OpenAITextEmbedder] Response validated: 35 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=35, skipped=15, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 900/15089: ok=596, skipped=303, failed=1
[OpenAITextEmbedder] Response validated: 34 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=34, skipped=16, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 950/15089: ok=630, skipped=319, failed=1
[OpenAITextEmbedder] Response validated: 30 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=30, skipped=20, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 1000/15089: ok=660, skipped=339, failed=1
[OpenAITextEmbedder] Response validated: 26 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=26, skipped=24, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 1050/15089: ok=686, skipped=363, failed=1
[SiliconFlowSummarizer] request failed: The operation was aborted due to timeout
[SiliconFlowSummarizer] request failed: The operation was aborted due to timeout
[FIX] marking 2 failed rows with [failed:*] placeholder to prevent infinite retry loop
[OpenAITextEmbedder] Response validated: 31 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=31, skipped=17, failed=2)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 1100/15089: ok=717, skipped=380, failed=3
[OpenAITextEmbedder] Response validated: 34 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=34, skipped=16, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 1150/15089: ok=751, skipped=396, failed=3
[OpenAITextEmbedder] Response validated: 37 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=37, skipped=13, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 1200/15089: ok=788, skipped=409, failed=3
[OpenAITextEmbedder] Response validated: 34 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=34, skipped=16, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 1250/15089: ok=822, skipped=425, failed=3
[OpenAITextEmbedder] Response validated: 36 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=36, skipped=14, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 1300/15089: ok=858, skipped=439, failed=3
[OpenAITextEmbedder] Response validated: 32 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=32, skipped=18, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 1350/15089: ok=890, skipped=457, failed=3
[OpenAITextEmbedder] Response validated: 34 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=34, skipped=16, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 1400/15089: ok=924, skipped=473, failed=3
[OpenAITextEmbedder] Response validated: 34 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=34, skipped=16, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 1450/15089: ok=958, skipped=489, failed=3
[OpenAITextEmbedder] Response validated: 33 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=33, skipped=17, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 1500/15089: ok=991, skipped=506, failed=3
[OpenAITextEmbedder] Response validated: 32 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=32, skipped=18, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 1550/15089: ok=1023, skipped=524, failed=3
[OpenAITextEmbedder] Response validated: 34 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=34, skipped=16, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 1600/15089: ok=1057, skipped=540, failed=3
[OpenAITextEmbedder] Response validated: 36 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=36, skipped=14, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 1650/15089: ok=1093, skipped=554, failed=3
[OpenAITextEmbedder] Response validated: 38 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=38, skipped=12, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 1700/15089: ok=1131, skipped=566, failed=3
[OpenAITextEmbedder] Response validated: 33 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=33, skipped=17, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 1750/15089: ok=1164, skipped=583, failed=3
[OpenAITextEmbedder] Response validated: 37 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=37, skipped=13, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 1800/15089: ok=1201, skipped=596, failed=3
[OpenAITextEmbedder] Response validated: 31 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=31, skipped=19, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 1850/15089: ok=1232, skipped=615, failed=3
[OpenAITextEmbedder] Response validated: 32 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=32, skipped=18, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 1900/15089: ok=1264, skipped=633, failed=3
[OpenAITextEmbedder] Response validated: 33 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=33, skipped=17, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 1950/15089: ok=1297, skipped=650, failed=3
[OpenAITextEmbedder] Response validated: 35 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=35, skipped=15, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 2000/15089: ok=1332, skipped=665, failed=3
[OpenAITextEmbedder] Response validated: 32 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=32, skipped=18, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 2050/15089: ok=1364, skipped=683, failed=3
[OpenAITextEmbedder] Response validated: 32 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=32, skipped=18, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 2100/15089: ok=1396, skipped=701, failed=3
[OpenAITextEmbedder] Response validated: 30 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=30, skipped=20, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 2150/15089: ok=1426, skipped=721, failed=3
[OpenAITextEmbedder] Response validated: 31 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=31, skipped=19, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 2200/15089: ok=1457, skipped=740, failed=3
[OpenAITextEmbedder] Response validated: 29 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=29, skipped=21, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 2250/15089: ok=1486, skipped=761, failed=3
[OpenAITextEmbedder] Response validated: 39 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=39, skipped=11, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 2300/15089: ok=1525, skipped=772, failed=3
[OpenAITextEmbedder] Response validated: 35 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=35, skipped=15, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 2350/15089: ok=1560, skipped=787, failed=3
[OpenAITextEmbedder] Response validated: 35 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=35, skipped=15, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 2400/15089: ok=1595, skipped=802, failed=3
[OpenAITextEmbedder] Response validated: 35 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=35, skipped=15, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 2450/15089: ok=1630, skipped=817, failed=3
[OpenAITextEmbedder] Response validated: 32 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=32, skipped=18, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 2500/15089: ok=1662, skipped=835, failed=3
[OpenAITextEmbedder] Response validated: 33 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=33, skipped=17, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 2550/15089: ok=1695, skipped=852, failed=3
[OpenAITextEmbedder] Response validated: 37 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=37, skipped=13, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 2600/15089: ok=1732, skipped=865, failed=3
[OpenAITextEmbedder] Response validated: 33 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=33, skipped=17, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 2650/15089: ok=1765, skipped=882, failed=3
[OpenAITextEmbedder] Response validated: 36 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=36, skipped=14, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 2700/15089: ok=1801, skipped=896, failed=3
[OpenAITextEmbedder] Response validated: 34 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=34, skipped=16, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 2750/15089: ok=1835, skipped=912, failed=3
[OpenAITextEmbedder] Response validated: 31 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=31, skipped=19, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 2800/15089: ok=1866, skipped=931, failed=3
[OpenAITextEmbedder] Response validated: 32 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=32, skipped=18, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 2850/15089: ok=1898, skipped=949, failed=3
[OpenAITextEmbedder] Response validated: 37 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=37, skipped=13, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 2900/15089: ok=1935, skipped=962, failed=3
[OpenAITextEmbedder] Response validated: 29 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=29, skipped=21, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 2950/15089: ok=1964, skipped=983, failed=3
[OpenAITextEmbedder] Response validated: 31 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=31, skipped=19, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 3000/15089: ok=1995, skipped=1002, failed=3
[OpenAITextEmbedder] Response validated: 34 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=34, skipped=16, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 3050/15089: ok=2029, skipped=1018, failed=3
[OpenAITextEmbedder] Response validated: 31 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=31, skipped=19, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 3100/15089: ok=2060, skipped=1037, failed=3
[OpenAITextEmbedder] Response validated: 36 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=36, skipped=14, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 3150/15089: ok=2096, skipped=1051, failed=3
[SiliconFlowSummarizer] Empty message content. Body preview: {"id":"019dd135f6c529cdd98b05dd2f05c0a7","object":"chat.completion","created":1777331468,"model":"Qwen/Qwen2.5-7B-Instruct","choices":[{"index":0,"message":{"role":"assistant","content":""},"finish_re
[FIX] marking 1 failed rows with [failed:*] placeholder to prevent infinite retry loop
[OpenAITextEmbedder] Response validated: 32 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=32, skipped=17, failed=1)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 3200/15089: ok=2128, skipped=1068, failed=4
[SiliconFlowSummarizer] request failed: The operation was aborted due to timeout
[SiliconFlowSummarizer] request failed: The operation was aborted due to timeout
[FIX] marking 2 failed rows with [failed:*] placeholder to prevent infinite retry loop
[OpenAITextEmbedder] Response validated: 32 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=32, skipped=16, failed=2)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 3250/15089: ok=2160, skipped=1084, failed=6
[OpenAITextEmbedder] Response validated: 30 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=30, skipped=20, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 3300/15089: ok=2190, skipped=1104, failed=6
[OpenAITextEmbedder] Response validated: 34 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=34, skipped=16, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 3350/15089: ok=2224, skipped=1120, failed=6
[OpenAITextEmbedder] Response validated: 35 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=35, skipped=15, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 3400/15089: ok=2259, skipped=1135, failed=6
[OpenAITextEmbedder] Response validated: 27 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=27, skipped=23, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 3450/15089: ok=2286, skipped=1158, failed=6
[OpenAITextEmbedder] Response validated: 28 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=28, skipped=22, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 3500/15089: ok=2314, skipped=1180, failed=6
[OpenAITextEmbedder] Response validated: 34 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=34, skipped=16, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 3550/15089: ok=2348, skipped=1196, failed=6
[OpenAITextEmbedder] Response validated: 35 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=35, skipped=15, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 3600/15089: ok=2383, skipped=1211, failed=6
[OpenAITextEmbedder] Response validated: 33 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=33, skipped=17, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 3650/15089: ok=2416, skipped=1228, failed=6
[OpenAITextEmbedder] Response validated: 33 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=33, skipped=17, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 3700/15089: ok=2449, skipped=1245, failed=6
[OpenAITextEmbedder] Response validated: 33 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=33, skipped=17, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 3750/15089: ok=2482, skipped=1262, failed=6
[OpenAITextEmbedder] Response validated: 31 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=31, skipped=19, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 3800/15089: ok=2513, skipped=1281, failed=6
[OpenAITextEmbedder] Response validated: 35 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=35, skipped=15, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 3850/15089: ok=2548, skipped=1296, failed=6
[OpenAITextEmbedder] Response validated: 30 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=30, skipped=20, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 3900/15089: ok=2578, skipped=1316, failed=6
[OpenAITextEmbedder] Response validated: 32 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=32, skipped=18, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 3950/15089: ok=2610, skipped=1334, failed=6
[OpenAITextEmbedder] Response validated: 31 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=31, skipped=19, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 4000/15089: ok=2641, skipped=1353, failed=6
[OpenAITextEmbedder] Response validated: 29 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=29, skipped=21, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 4050/15089: ok=2670, skipped=1374, failed=6
[OpenAITextEmbedder] Response validated: 29 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=29, skipped=21, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 4100/15089: ok=2699, skipped=1395, failed=6
[OpenAITextEmbedder] Response validated: 34 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=34, skipped=16, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 4150/15089: ok=2733, skipped=1411, failed=6
[OpenAITextEmbedder] Response validated: 31 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=31, skipped=19, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 4200/15089: ok=2764, skipped=1430, failed=6
[OpenAITextEmbedder] Response validated: 35 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=35, skipped=15, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 4250/15089: ok=2799, skipped=1445, failed=6
[OpenAITextEmbedder] Response validated: 29 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=29, skipped=21, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 4300/15089: ok=2828, skipped=1466, failed=6
[OpenAITextEmbedder] Response validated: 35 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=35, skipped=15, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 4350/15089: ok=2863, skipped=1481, failed=6
[OpenAITextEmbedder] Response validated: 29 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=29, skipped=21, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 4400/15089: ok=2892, skipped=1502, failed=6
[OpenAITextEmbedder] Response validated: 32 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=32, skipped=18, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 4450/15089: ok=2924, skipped=1520, failed=6
[OpenAITextEmbedder] Response validated: 37 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=37, skipped=13, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 4500/15089: ok=2961, skipped=1533, failed=6
[OpenAITextEmbedder] Response validated: 33 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=33, skipped=17, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 4550/15089: ok=2994, skipped=1550, failed=6
[OpenAITextEmbedder] Response validated: 31 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=31, skipped=19, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 4600/15089: ok=3025, skipped=1569, failed=6
[OpenAITextEmbedder] Response validated: 32 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=32, skipped=18, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 4650/15089: ok=3057, skipped=1587, failed=6
[OpenAITextEmbedder] Response validated: 33 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=33, skipped=17, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 4700/15089: ok=3090, skipped=1604, failed=6
[OpenAITextEmbedder] Response validated: 35 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=35, skipped=15, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 4750/15089: ok=3125, skipped=1619, failed=6
[OpenAITextEmbedder] Response validated: 32 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=32, skipped=18, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 4800/15089: ok=3157, skipped=1637, failed=6
[OpenAITextEmbedder] Response validated: 33 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=33, skipped=17, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 4850/15089: ok=3190, skipped=1654, failed=6
[OpenAITextEmbedder] Response validated: 31 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=31, skipped=19, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 4900/15089: ok=3221, skipped=1673, failed=6
[OpenAITextEmbedder] Response validated: 32 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=32, skipped=18, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 4950/15089: ok=3253, skipped=1691, failed=6
[OpenAITextEmbedder] Response validated: 31 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=31, skipped=19, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 5000/15089: ok=3284, skipped=1710, failed=6
[OpenAITextEmbedder] Response validated: 32 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=32, skipped=18, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 5050/15089: ok=3316, skipped=1728, failed=6
[OpenAITextEmbedder] Response validated: 31 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=31, skipped=19, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 5100/15089: ok=3347, skipped=1747, failed=6
[OpenAITextEmbedder] Response validated: 36 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=36, skipped=14, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 5150/15089: ok=3383, skipped=1761, failed=6
[OpenAITextEmbedder] Response validated: 30 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=30, skipped=20, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 5200/15089: ok=3413, skipped=1781, failed=6
[OpenAITextEmbedder] Response validated: 33 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=33, skipped=17, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 5250/15089: ok=3446, skipped=1798, failed=6
[OpenAITextEmbedder] Response validated: 33 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=33, skipped=17, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 5300/15089: ok=3479, skipped=1815, failed=6
[OpenAITextEmbedder] Response validated: 35 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=35, skipped=15, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 5350/15089: ok=3514, skipped=1830, failed=6
[SiliconFlowSummarizer] request failed: The operation was aborted due to timeout
[FIX] marking 1 failed rows with [failed:*] placeholder to prevent infinite retry loop
[OpenAITextEmbedder] Response validated: 38 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=38, skipped=11, failed=1)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 5400/15089: ok=3552, skipped=1841, failed=7
[OpenAITextEmbedder] Response validated: 27 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=27, skipped=23, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 5450/15089: ok=3579, skipped=1864, failed=7
[OpenAITextEmbedder] Response validated: 32 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=32, skipped=18, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 5500/15089: ok=3611, skipped=1882, failed=7
[OpenAITextEmbedder] Response validated: 35 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=35, skipped=15, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 5550/15089: ok=3646, skipped=1897, failed=7
[OpenAITextEmbedder] Response validated: 30 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=30, skipped=20, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 5600/15089: ok=3676, skipped=1917, failed=7
[OpenAITextEmbedder] Response validated: 29 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=29, skipped=21, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 5650/15089: ok=3705, skipped=1938, failed=7
[OpenAITextEmbedder] Response validated: 29 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=29, skipped=21, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 5700/15089: ok=3734, skipped=1959, failed=7
[OpenAITextEmbedder] Response validated: 39 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=39, skipped=11, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 5750/15089: ok=3773, skipped=1970, failed=7
[SiliconFlowSummarizer] request failed: The operation was aborted due to timeout
[FIX] marking 1 failed rows with [failed:*] placeholder to prevent infinite retry loop
[OpenAITextEmbedder] Response validated: 30 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=30, skipped=19, failed=1)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 5800/15089: ok=3803, skipped=1989, failed=8
[OpenAITextEmbedder] Response validated: 31 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=31, skipped=19, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 5850/15089: ok=3834, skipped=2008, failed=8
[OpenAITextEmbedder] Response validated: 35 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=35, skipped=15, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 5900/15089: ok=3869, skipped=2023, failed=8
[OpenAITextEmbedder] Response validated: 36 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=36, skipped=14, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 5950/15089: ok=3905, skipped=2037, failed=8
[OpenAITextEmbedder] Response validated: 37 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=37, skipped=13, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 6000/15089: ok=3942, skipped=2050, failed=8
[OpenAITextEmbedder] Response validated: 36 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=36, skipped=14, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 6050/15089: ok=3978, skipped=2064, failed=8
[OpenAITextEmbedder] Response validated: 29 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=29, skipped=21, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 6100/15089: ok=4007, skipped=2085, failed=8
[OpenAITextEmbedder] Response validated: 32 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=32, skipped=18, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 6150/15089: ok=4039, skipped=2103, failed=8
[OpenAITextEmbedder] Response validated: 30 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=30, skipped=20, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 6200/15089: ok=4069, skipped=2123, failed=8
[OpenAITextEmbedder] Response validated: 27 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=27, skipped=23, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 6250/15089: ok=4096, skipped=2146, failed=8
[OpenAITextEmbedder] Response validated: 37 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=37, skipped=13, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 6300/15089: ok=4133, skipped=2159, failed=8
[OpenAITextEmbedder] Response validated: 30 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=30, skipped=20, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 6350/15089: ok=4163, skipped=2179, failed=8
[OpenAITextEmbedder] Response validated: 32 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=32, skipped=18, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 6400/15089: ok=4195, skipped=2197, failed=8
[OpenAITextEmbedder] Response validated: 26 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=26, skipped=24, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 6450/15089: ok=4221, skipped=2221, failed=8
[OpenAITextEmbedder] Response validated: 33 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=33, skipped=17, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 6500/15089: ok=4254, skipped=2238, failed=8
[OpenAITextEmbedder] Response validated: 34 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=34, skipped=16, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 6550/15089: ok=4288, skipped=2254, failed=8
[OpenAITextEmbedder] Response validated: 29 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=29, skipped=21, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 6600/15089: ok=4317, skipped=2275, failed=8
[SiliconFlowSummarizer] request failed: The operation was aborted due to timeout
[SiliconFlowSummarizer] request failed: The operation was aborted due to timeout
[FIX] marking 2 failed rows with [failed:*] placeholder to prevent infinite retry loop
[OpenAITextEmbedder] Response validated: 24 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=24, skipped=24, failed=2)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 6650/15089: ok=4341, skipped=2299, failed=10
[OpenAITextEmbedder] Response validated: 29 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=29, skipped=21, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 6700/15089: ok=4370, skipped=2320, failed=10
[OpenAITextEmbedder] Response validated: 32 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=32, skipped=18, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 6750/15089: ok=4402, skipped=2338, failed=10
[OpenAITextEmbedder] Response validated: 32 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=32, skipped=18, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 6800/15089: ok=4434, skipped=2356, failed=10
[OpenAITextEmbedder] Response validated: 36 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=36, skipped=14, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 6850/15089: ok=4470, skipped=2370, failed=10
[OpenAITextEmbedder] Response validated: 32 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=32, skipped=18, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 6900/15089: ok=4502, skipped=2388, failed=10
[OpenAITextEmbedder] Response validated: 37 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=37, skipped=13, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 6950/15089: ok=4539, skipped=2401, failed=10
[OpenAITextEmbedder] Response validated: 34 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=34, skipped=16, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 7000/15089: ok=4573, skipped=2417, failed=10
[OpenAITextEmbedder] Response validated: 34 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=34, skipped=16, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 7050/15089: ok=4607, skipped=2433, failed=10
[OpenAITextEmbedder] Response validated: 33 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=33, skipped=17, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 7100/15089: ok=4640, skipped=2450, failed=10
[OpenAITextEmbedder] Response validated: 31 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=31, skipped=19, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 7150/15089: ok=4671, skipped=2469, failed=10
[OpenAITextEmbedder] Response validated: 32 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=32, skipped=18, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 7200/15089: ok=4703, skipped=2487, failed=10
[OpenAITextEmbedder] Response validated: 33 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=33, skipped=17, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 7250/15089: ok=4736, skipped=2504, failed=10
[OpenAITextEmbedder] Response validated: 33 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=33, skipped=17, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 7300/15089: ok=4769, skipped=2521, failed=10
[OpenAITextEmbedder] Response validated: 36 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=36, skipped=14, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 7350/15089: ok=4805, skipped=2535, failed=10
[OpenAITextEmbedder] Response validated: 33 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=33, skipped=17, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 7400/15089: ok=4838, skipped=2552, failed=10
[OpenAITextEmbedder] Response validated: 39 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=39, skipped=11, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 7450/15089: ok=4877, skipped=2563, failed=10
[OpenAITextEmbedder] Response validated: 34 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=34, skipped=16, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 7500/15089: ok=4911, skipped=2579, failed=10
[OpenAITextEmbedder] Response validated: 28 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=28, skipped=22, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 7550/15089: ok=4939, skipped=2601, failed=10
[OpenAITextEmbedder] Response validated: 31 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=31, skipped=19, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 7600/15089: ok=4970, skipped=2620, failed=10
[OpenAITextEmbedder] Response validated: 30 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=30, skipped=20, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 7650/15089: ok=5000, skipped=2640, failed=10
[OpenAITextEmbedder] Response validated: 37 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=37, skipped=13, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 7700/15089: ok=5037, skipped=2653, failed=10
[OpenAITextEmbedder] Response validated: 32 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=32, skipped=18, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 7750/15089: ok=5069, skipped=2671, failed=10
[OpenAITextEmbedder] Response validated: 35 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=35, skipped=15, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 7800/15089: ok=5104, skipped=2686, failed=10
[OpenAITextEmbedder] Response validated: 32 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=32, skipped=18, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 7850/15089: ok=5136, skipped=2704, failed=10
[OpenAITextEmbedder] Response validated: 32 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=32, skipped=18, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 7900/15089: ok=5168, skipped=2722, failed=10
[OpenAITextEmbedder] Response validated: 33 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=33, skipped=17, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 7950/15089: ok=5201, skipped=2739, failed=10
[OpenAITextEmbedder] Response validated: 35 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=35, skipped=15, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 8000/15089: ok=5236, skipped=2754, failed=10
[OpenAITextEmbedder] Response validated: 29 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=29, skipped=21, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 8050/15089: ok=5265, skipped=2775, failed=10
[OpenAITextEmbedder] Response validated: 33 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=33, skipped=17, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 8100/15089: ok=5298, skipped=2792, failed=10
[OpenAITextEmbedder] Response validated: 33 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=33, skipped=17, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 8150/15089: ok=5331, skipped=2809, failed=10
[OpenAITextEmbedder] Response validated: 33 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=33, skipped=17, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 8200/15089: ok=5364, skipped=2826, failed=10
[OpenAITextEmbedder] Response validated: 30 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=30, skipped=20, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 8250/15089: ok=5394, skipped=2846, failed=10
[OpenAITextEmbedder] Response validated: 34 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=34, skipped=16, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 8300/15089: ok=5428, skipped=2862, failed=10
[OpenAITextEmbedder] Response validated: 34 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=34, skipped=16, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 8350/15089: ok=5462, skipped=2878, failed=10
[OpenAITextEmbedder] Response validated: 32 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=32, skipped=18, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 8400/15089: ok=5494, skipped=2896, failed=10
[OpenAITextEmbedder] Response validated: 29 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=29, skipped=21, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 8450/15089: ok=5523, skipped=2917, failed=10
[OpenAITextEmbedder] Response validated: 32 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=32, skipped=18, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 8500/15089: ok=5555, skipped=2935, failed=10
[OpenAITextEmbedder] Response validated: 33 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=33, skipped=17, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 8550/15089: ok=5588, skipped=2952, failed=10
[OpenAITextEmbedder] Response validated: 31 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=31, skipped=19, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 8600/15089: ok=5619, skipped=2971, failed=10
[OpenAITextEmbedder] Response validated: 33 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=33, skipped=17, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 8650/15089: ok=5652, skipped=2988, failed=10
[OpenAITextEmbedder] Response validated: 33 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=33, skipped=17, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 8700/15089: ok=5685, skipped=3005, failed=10
[OpenAITextEmbedder] Response validated: 28 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=28, skipped=22, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 8750/15089: ok=5713, skipped=3027, failed=10
[OpenAITextEmbedder] Response validated: 38 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=38, skipped=12, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 8800/15089: ok=5751, skipped=3039, failed=10
[OpenAITextEmbedder] Response validated: 32 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=32, skipped=18, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 8850/15089: ok=5783, skipped=3057, failed=10
[OpenAITextEmbedder] Response validated: 34 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=34, skipped=16, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 8900/15089: ok=5817, skipped=3073, failed=10
[OpenAITextEmbedder] Response validated: 29 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=29, skipped=21, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 8950/15089: ok=5846, skipped=3094, failed=10
[OpenAITextEmbedder] Response validated: 30 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=30, skipped=20, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 9000/15089: ok=5876, skipped=3114, failed=10
[OpenAITextEmbedder] Response validated: 34 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=34, skipped=16, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 9050/15089: ok=5910, skipped=3130, failed=10
[OpenAITextEmbedder] Response validated: 31 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=31, skipped=19, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 9100/15089: ok=5941, skipped=3149, failed=10
[OpenAITextEmbedder] Response validated: 31 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=31, skipped=19, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 9150/15089: ok=5972, skipped=3168, failed=10
[OpenAITextEmbedder] Response validated: 29 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=29, skipped=21, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 9200/15089: ok=6001, skipped=3189, failed=10
[OpenAITextEmbedder] Response validated: 37 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=37, skipped=13, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 9250/15089: ok=6038, skipped=3202, failed=10
[OpenAITextEmbedder] Response validated: 33 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=33, skipped=17, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 9300/15089: ok=6071, skipped=3219, failed=10
[SiliconFlowSummarizer] request failed: The operation was aborted due to timeout
[SiliconFlowSummarizer] request failed: The operation was aborted due to timeout
[SiliconFlowSummarizer] request failed: The operation was aborted due to timeout
[SiliconFlowSummarizer] request failed: The operation was aborted due to timeout
[FIX] marking 4 failed rows with [failed:*] placeholder to prevent infinite retry loop
[OpenAITextEmbedder] Response validated: 34 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=34, skipped=12, failed=4)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 9350/15089: ok=6105, skipped=3231, failed=14
[OpenAITextEmbedder] Response validated: 30 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=30, skipped=20, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 9400/15089: ok=6135, skipped=3251, failed=14
[OpenAITextEmbedder] Response validated: 30 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=30, skipped=20, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 9450/15089: ok=6165, skipped=3271, failed=14
[SiliconFlowSummarizer] request failed: The operation was aborted due to timeout
[SiliconFlowSummarizer] request failed: The operation was aborted due to timeout
[SiliconFlowSummarizer] request failed: The operation was aborted due to timeout
[FIX] marking 3 failed rows with [failed:*] placeholder to prevent infinite retry loop
[OpenAITextEmbedder] Response validated: 33 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=33, skipped=14, failed=3)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 9500/15089: ok=6198, skipped=3285, failed=17
[OpenAITextEmbedder] Response validated: 28 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=28, skipped=22, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 9550/15089: ok=6226, skipped=3307, failed=17
[OpenAITextEmbedder] Response validated: 28 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=28, skipped=22, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 9600/15089: ok=6254, skipped=3329, failed=17
[OpenAITextEmbedder] Response validated: 30 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=30, skipped=20, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 9650/15089: ok=6284, skipped=3349, failed=17
[OpenAITextEmbedder] Response validated: 28 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=28, skipped=22, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 9700/15089: ok=6312, skipped=3371, failed=17
[SiliconFlowSummarizer] request failed: The operation was aborted due to timeout
[FIX] marking 1 failed rows with [failed:*] placeholder to prevent infinite retry loop
[OpenAITextEmbedder] Response validated: 25 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=25, skipped=24, failed=1)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 9750/15089: ok=6337, skipped=3395, failed=18
[OpenAITextEmbedder] Response validated: 34 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=34, skipped=16, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 9800/15089: ok=6371, skipped=3411, failed=18
[OpenAITextEmbedder] Response validated: 32 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=32, skipped=18, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 9850/15089: ok=6403, skipped=3429, failed=18
[OpenAITextEmbedder] Response validated: 33 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=33, skipped=17, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 9900/15089: ok=6436, skipped=3446, failed=18
[OpenAITextEmbedder] Response validated: 33 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=33, skipped=17, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 9950/15089: ok=6469, skipped=3463, failed=18
[OpenAITextEmbedder] Response validated: 32 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=32, skipped=18, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 10000/15089: ok=6501, skipped=3481, failed=18
[OpenAITextEmbedder] Response validated: 39 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=39, skipped=11, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 10050/15089: ok=6540, skipped=3492, failed=18
[OpenAITextEmbedder] Response validated: 31 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=31, skipped=19, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 10100/15089: ok=6571, skipped=3511, failed=18
[OpenAITextEmbedder] Response validated: 34 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=34, skipped=16, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 10150/15089: ok=6605, skipped=3527, failed=18
[OpenAITextEmbedder] Response validated: 38 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=38, skipped=12, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 10200/15089: ok=6643, skipped=3539, failed=18
[OpenAITextEmbedder] Response validated: 35 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=35, skipped=15, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 10250/15089: ok=6678, skipped=3554, failed=18
[SiliconFlowSummarizer] request failed: The operation was aborted due to timeout
[SiliconFlowSummarizer] request failed: The operation was aborted due to timeout
[FIX] marking 2 failed rows with [failed:*] placeholder to prevent infinite retry loop
[OpenAITextEmbedder] Response validated: 30 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=30, skipped=18, failed=2)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 10300/15089: ok=6708, skipped=3572, failed=20
[SiliconFlowSummarizer] request failed: The operation was aborted due to timeout
[SiliconFlowSummarizer] request failed: fetch failed
[SiliconFlowSummarizer] request failed: fetch failed
[SiliconFlowSummarizer] request failed: fetch failed
[SiliconFlowSummarizer] request failed: fetch failed
[SiliconFlowSummarizer] request failed: fetch failed
[SiliconFlowSummarizer] request failed: fetch failed
[SiliconFlowSummarizer] request failed: fetch failed
[SiliconFlowSummarizer] request failed: fetch failed
[SiliconFlowSummarizer] request failed: fetch failed
[SiliconFlowSummarizer] request failed: fetch failed
[SiliconFlowSummarizer] request failed: fetch failed
[SiliconFlowSummarizer] request failed: fetch failed
[SiliconFlowSummarizer] request failed: fetch failed
[SiliconFlowSummarizer] request failed: fetch failed
[SiliconFlowSummarizer] request failed: fetch failed
[SiliconFlowSummarizer] request failed: fetch failed
[SiliconFlowSummarizer] request failed: fetch failed
[SiliconFlowSummarizer] request failed: fetch failed
[SiliconFlowSummarizer] request failed: fetch failed
[SiliconFlowSummarizer] request failed: fetch failed
[SiliconFlowSummarizer] request failed: fetch failed
[SiliconFlowSummarizer] request failed: fetch failed
[SiliconFlowSummarizer] request failed: fetch failed
[SiliconFlowSummarizer] request failed: fetch failed
[SiliconFlowSummarizer] request failed: fetch failed
[SiliconFlowSummarizer] request failed: The operation was aborted due to timeout
[SiliconFlowSummarizer] request failed: The operation was aborted due to timeout
[SiliconFlowSummarizer] request failed: The operation was aborted due to timeout
[FIX] marking 29 failed rows with [failed:*] placeholder to prevent infinite retry loop
Ошибка команды rag summarize для источника "karipos": fetch failed
Источник: karipos (id=87709deb-913d-4cce-88d1-8573837dcc3b)
Кандидатов с NULL summary (source_type=code): 4789
[OpenAITextEmbedder] Response validated: 32 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=32, skipped=18, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 50/4789: ok=32, skipped=18, failed=0
[OpenAITextEmbedder] Response validated: 36 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=36, skipped=14, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 100/4789: ok=68, skipped=32, failed=0
[OpenAITextEmbedder] Response validated: 34 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=34, skipped=16, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 150/4789: ok=102, skipped=48, failed=0
[OpenAITextEmbedder] Response validated: 35 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=35, skipped=15, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 200/4789: ok=137, skipped=63, failed=0
[OpenAITextEmbedder] Response validated: 30 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=30, skipped=20, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 250/4789: ok=167, skipped=83, failed=0
[OpenAITextEmbedder] Response validated: 31 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=31, skipped=19, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 300/4789: ok=198, skipped=102, failed=0
[OpenAITextEmbedder] Response validated: 35 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=35, skipped=15, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 350/4789: ok=233, skipped=117, failed=0
[SiliconFlowSummarizer] request failed: The operation was aborted due to timeout
[SiliconFlowSummarizer] request failed: The operation was aborted due to timeout
[SiliconFlowSummarizer] request failed: The operation was aborted due to timeout
[FIX] marking 3 failed rows with [failed:*] placeholder to prevent infinite retry loop
[OpenAITextEmbedder] Response validated: 36 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=36, skipped=11, failed=3)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 400/4789: ok=269, skipped=128, failed=3
[SiliconFlowSummarizer] request failed: The operation was aborted due to timeout
[SiliconFlowSummarizer] request failed: The operation was aborted due to timeout
[FIX] marking 2 failed rows with [failed:*] placeholder to prevent infinite retry loop
[OpenAITextEmbedder] Response validated: 29 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=29, skipped=19, failed=2)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 450/4789: ok=298, skipped=147, failed=5
[OpenAITextEmbedder] Response validated: 34 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=34, skipped=16, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 500/4789: ok=332, skipped=163, failed=5
[OpenAITextEmbedder] Response validated: 34 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=34, skipped=16, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 550/4789: ok=366, skipped=179, failed=5
[OpenAITextEmbedder] Response validated: 32 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=32, skipped=18, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 600/4789: ok=398, skipped=197, failed=5
[OpenAITextEmbedder] Response validated: 35 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=35, skipped=15, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 650/4789: ok=433, skipped=212, failed=5
[OpenAITextEmbedder] Response validated: 38 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=38, skipped=12, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 700/4789: ok=471, skipped=224, failed=5
[OpenAITextEmbedder] Response validated: 32 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=32, skipped=18, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 750/4789: ok=503, skipped=242, failed=5
[OpenAITextEmbedder] Response validated: 29 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=29, skipped=21, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 800/4789: ok=532, skipped=263, failed=5
[OpenAITextEmbedder] Response validated: 36 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=36, skipped=14, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 850/4789: ok=568, skipped=277, failed=5
[OpenAITextEmbedder] Response validated: 29 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=29, skipped=21, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 900/4789: ok=597, skipped=298, failed=5
[SiliconFlowSummarizer] request failed: The operation was aborted due to timeout
[SiliconFlowSummarizer] request failed: The operation was aborted due to timeout
[FIX] marking 2 failed rows with [failed:*] placeholder to prevent infinite retry loop
[OpenAITextEmbedder] Response validated: 29 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=29, skipped=19, failed=2)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 950/4789: ok=626, skipped=317, failed=7
[SiliconFlowSummarizer] request failed: The operation was aborted due to timeout
[SiliconFlowSummarizer] request failed: The operation was aborted due to timeout
[FIX] marking 2 failed rows with [failed:*] placeholder to prevent infinite retry loop
[OpenAITextEmbedder] Response validated: 35 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=35, skipped=13, failed=2)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 1000/4789: ok=661, skipped=330, failed=9
[OpenAITextEmbedder] Response validated: 29 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=29, skipped=21, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 1050/4789: ok=690, skipped=351, failed=9
[OpenAITextEmbedder] Response validated: 29 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=29, skipped=21, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 1100/4789: ok=719, skipped=372, failed=9
[SiliconFlowSummarizer] request failed: The operation was aborted due to timeout
[FIX] marking 1 failed rows with [failed:*] placeholder to prevent infinite retry loop
[OpenAITextEmbedder] Response validated: 32 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=32, skipped=17, failed=1)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 1150/4789: ok=751, skipped=389, failed=10
[SiliconFlowSummarizer] request failed: The operation was aborted due to timeout
[SiliconFlowSummarizer] request failed: The operation was aborted due to timeout
[FIX] marking 2 failed rows with [failed:*] placeholder to prevent infinite retry loop
[OpenAITextEmbedder] Response validated: 27 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=27, skipped=21, failed=2)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 1200/4789: ok=778, skipped=410, failed=12
[OpenAITextEmbedder] Response validated: 32 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=32, skipped=18, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 1250/4789: ok=810, skipped=428, failed=12
[OpenAITextEmbedder] Response validated: 35 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=35, skipped=15, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 1300/4789: ok=845, skipped=443, failed=12
[OpenAITextEmbedder] Response validated: 33 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=33, skipped=17, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 1350/4789: ok=878, skipped=460, failed=12
[OpenAITextEmbedder] Response validated: 32 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=32, skipped=18, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 1400/4789: ok=910, skipped=478, failed=12
[SiliconFlowSummarizer] request failed: The operation was aborted due to timeout
[SiliconFlowSummarizer] request failed: The operation was aborted due to timeout
[SiliconFlowSummarizer] request failed: The operation was aborted due to timeout
[SiliconFlowSummarizer] request failed: The operation was aborted due to timeout
[FIX] marking 4 failed rows with [failed:*] placeholder to prevent infinite retry loop
[OpenAITextEmbedder] Response validated: 33 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=33, skipped=13, failed=4)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 1450/4789: ok=943, skipped=491, failed=16
[OpenAITextEmbedder] Response validated: 36 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=36, skipped=14, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 1500/4789: ok=979, skipped=505, failed=16
[OpenAITextEmbedder] Response validated: 31 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=31, skipped=19, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 1550/4789: ok=1010, skipped=524, failed=16
[OpenAITextEmbedder] Response validated: 26 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=26, skipped=24, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 1600/4789: ok=1036, skipped=548, failed=16
[OpenAITextEmbedder] Response validated: 35 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=35, skipped=15, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 1650/4789: ok=1071, skipped=563, failed=16
[OpenAITextEmbedder] Response validated: 31 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=31, skipped=19, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 1700/4789: ok=1102, skipped=582, failed=16
[OpenAITextEmbedder] Response validated: 35 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=35, skipped=15, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 1750/4789: ok=1137, skipped=597, failed=16
[OpenAITextEmbedder] Response validated: 25 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=25, skipped=25, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 1800/4789: ok=1162, skipped=622, failed=16
[OpenAITextEmbedder] Response validated: 27 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=27, skipped=23, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 1850/4789: ok=1189, skipped=645, failed=16
[OpenAITextEmbedder] Response validated: 35 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=35, skipped=15, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 1900/4789: ok=1224, skipped=660, failed=16
[OpenAITextEmbedder] Response validated: 33 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=33, skipped=17, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 1950/4789: ok=1257, skipped=677, failed=16
[OpenAITextEmbedder] Response validated: 36 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=36, skipped=14, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 2000/4789: ok=1293, skipped=691, failed=16
[OpenAITextEmbedder] Response validated: 37 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=37, skipped=13, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 2050/4789: ok=1330, skipped=704, failed=16
[OpenAITextEmbedder] Response validated: 28 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=28, skipped=22, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 2100/4789: ok=1358, skipped=726, failed=16
[OpenAITextEmbedder] Response validated: 30 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=30, skipped=20, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 2150/4789: ok=1388, skipped=746, failed=16
[OpenAITextEmbedder] Response validated: 28 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=28, skipped=22, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 2200/4789: ok=1416, skipped=768, failed=16
[OpenAITextEmbedder] Response validated: 34 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=34, skipped=16, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 2250/4789: ok=1450, skipped=784, failed=16
[OpenAITextEmbedder] Response validated: 31 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=31, skipped=19, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 2300/4789: ok=1481, skipped=803, failed=16
[OpenAITextEmbedder] Response validated: 35 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=35, skipped=15, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 2350/4789: ok=1516, skipped=818, failed=16
[OpenAITextEmbedder] Response validated: 31 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=31, skipped=19, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 2400/4789: ok=1547, skipped=837, failed=16
[SiliconFlowSummarizer] request failed: The operation was aborted due to timeout
[SiliconFlowSummarizer] request failed: The operation was aborted due to timeout
[SiliconFlowSummarizer] request failed: The operation was aborted due to timeout
[FIX] marking 3 failed rows with [failed:*] placeholder to prevent infinite retry loop
[OpenAITextEmbedder] Response validated: 29 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=29, skipped=18, failed=3)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 2450/4789: ok=1576, skipped=855, failed=19
[OpenAITextEmbedder] Response validated: 34 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=34, skipped=16, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 2500/4789: ok=1610, skipped=871, failed=19
[SiliconFlowSummarizer] request failed: The operation was aborted due to timeout
[SiliconFlowSummarizer] request failed: The operation was aborted due to timeout
[FIX] marking 2 failed rows with [failed:*] placeholder to prevent infinite retry loop
[OpenAITextEmbedder] Response validated: 31 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=31, skipped=17, failed=2)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 2550/4789: ok=1641, skipped=888, failed=21
[OpenAITextEmbedder] Response validated: 31 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=31, skipped=19, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 2600/4789: ok=1672, skipped=907, failed=21
[OpenAITextEmbedder] Response validated: 29 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=29, skipped=21, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 2650/4789: ok=1701, skipped=928, failed=21
[OpenAITextEmbedder] Response validated: 31 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=31, skipped=19, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 2700/4789: ok=1732, skipped=947, failed=21
[OpenAITextEmbedder] Response validated: 34 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=34, skipped=16, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 2750/4789: ok=1766, skipped=963, failed=21
[OpenAITextEmbedder] Response validated: 34 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=34, skipped=16, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 2800/4789: ok=1800, skipped=979, failed=21
[OpenAITextEmbedder] Response validated: 35 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=35, skipped=15, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 2850/4789: ok=1835, skipped=994, failed=21
[OpenAITextEmbedder] Response validated: 33 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=33, skipped=17, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 2900/4789: ok=1868, skipped=1011, failed=21
[OpenAITextEmbedder] Response validated: 36 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=36, skipped=14, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 2950/4789: ok=1904, skipped=1025, failed=21
[OpenAITextEmbedder] Response validated: 31 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=31, skipped=19, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 3000/4789: ok=1935, skipped=1044, failed=21
[OpenAITextEmbedder] Response validated: 31 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=31, skipped=19, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 3050/4789: ok=1966, skipped=1063, failed=21
[OpenAITextEmbedder] Response validated: 32 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=32, skipped=18, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 3100/4789: ok=1998, skipped=1081, failed=21
[OpenAITextEmbedder] Response validated: 36 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=36, skipped=14, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 3150/4789: ok=2034, skipped=1095, failed=21
[OpenAITextEmbedder] Response validated: 28 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=28, skipped=22, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 3200/4789: ok=2062, skipped=1117, failed=21
[OpenAITextEmbedder] Response validated: 26 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=26, skipped=24, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 3250/4789: ok=2088, skipped=1141, failed=21
[OpenAITextEmbedder] Response validated: 32 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=32, skipped=18, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 3300/4789: ok=2120, skipped=1159, failed=21
[OpenAITextEmbedder] Response validated: 36 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=36, skipped=14, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 3350/4789: ok=2156, skipped=1173, failed=21
[OpenAITextEmbedder] Response validated: 28 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=28, skipped=22, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 3400/4789: ok=2184, skipped=1195, failed=21
[SiliconFlowSummarizer] request failed: The operation was aborted due to timeout
[SiliconFlowSummarizer] request failed: The operation was aborted due to timeout
[FIX] marking 2 failed rows with [failed:*] placeholder to prevent infinite retry loop
[OpenAITextEmbedder] Response validated: 31 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=31, skipped=17, failed=2)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 3450/4789: ok=2215, skipped=1212, failed=23
[OpenAITextEmbedder] Response validated: 30 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=30, skipped=20, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 3500/4789: ok=2245, skipped=1232, failed=23
[OpenAITextEmbedder] Response validated: 33 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=33, skipped=17, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 3550/4789: ok=2278, skipped=1249, failed=23
[OpenAITextEmbedder] Response validated: 32 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=32, skipped=18, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 3600/4789: ok=2310, skipped=1267, failed=23
[OpenAITextEmbedder] Response validated: 35 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=35, skipped=15, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 3650/4789: ok=2345, skipped=1282, failed=23
[OpenAITextEmbedder] Response validated: 34 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=34, skipped=16, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 3700/4789: ok=2379, skipped=1298, failed=23
[OpenAITextEmbedder] Response validated: 35 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=35, skipped=15, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 3750/4789: ok=2414, skipped=1313, failed=23
[OpenAITextEmbedder] Response validated: 31 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=31, skipped=19, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 3800/4789: ok=2445, skipped=1332, failed=23
[SiliconFlowSummarizer] request failed: The operation was aborted due to timeout
[SiliconFlowSummarizer] request failed: The operation was aborted due to timeout
[SiliconFlowSummarizer] request failed: The operation was aborted due to timeout
[FIX] marking 3 failed rows with [failed:*] placeholder to prevent infinite retry loop
[OpenAITextEmbedder] Response validated: 35 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=35, skipped=12, failed=3)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 3850/4789: ok=2480, skipped=1344, failed=26
[OpenAITextEmbedder] Response validated: 26 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=26, skipped=24, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 3900/4789: ok=2506, skipped=1368, failed=26
[OpenAITextEmbedder] Response validated: 33 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=33, skipped=17, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 3950/4789: ok=2539, skipped=1385, failed=26
[SiliconFlowSummarizer] request failed: The operation was aborted due to timeout
[FIX] marking 1 failed rows with [failed:*] placeholder to prevent infinite retry loop
[OpenAITextEmbedder] Response validated: 34 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=34, skipped=15, failed=1)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 4000/4789: ok=2573, skipped=1400, failed=27
[SiliconFlowSummarizer] request failed: The operation was aborted due to timeout
[FIX] marking 1 failed rows with [failed:*] placeholder to prevent infinite retry loop
[OpenAITextEmbedder] Response validated: 30 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=30, skipped=19, failed=1)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 4050/4789: ok=2603, skipped=1419, failed=28
[OpenAITextEmbedder] Response validated: 32 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=32, skipped=18, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 4100/4789: ok=2635, skipped=1437, failed=28
[SiliconFlowSummarizer] request failed: The operation was aborted due to timeout
[FIX] marking 1 failed rows with [failed:*] placeholder to prevent infinite retry loop
[OpenAITextEmbedder] Response validated: 37 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=37, skipped=12, failed=1)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 4150/4789: ok=2672, skipped=1449, failed=29
[SiliconFlowSummarizer] request failed: The operation was aborted due to timeout
[FIX] marking 1 failed rows with [failed:*] placeholder to prevent infinite retry loop
[OpenAITextEmbedder] Response validated: 29 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=29, skipped=20, failed=1)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 4200/4789: ok=2701, skipped=1469, failed=30
[OpenAITextEmbedder] Response validated: 36 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=36, skipped=14, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 4250/4789: ok=2737, skipped=1483, failed=30
[OpenAITextEmbedder] Response validated: 34 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=34, skipped=16, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 4300/4789: ok=2771, skipped=1499, failed=30
[OpenAITextEmbedder] Response validated: 33 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=33, skipped=17, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 4350/4789: ok=2804, skipped=1516, failed=30
[OpenAITextEmbedder] Response validated: 26 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=26, skipped=24, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 4400/4789: ok=2830, skipped=1540, failed=30
[SiliconFlowSummarizer] request failed: The operation was aborted due to timeout
[SiliconFlowSummarizer] request failed: The operation was aborted due to timeout
[FIX] marking 2 failed rows with [failed:*] placeholder to prevent infinite retry loop
[OpenAITextEmbedder] Response validated: 33 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=33, skipped=15, failed=2)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 4450/4789: ok=2863, skipped=1555, failed=32
[SiliconFlowSummarizer] request failed: The operation was aborted due to timeout
[SiliconFlowSummarizer] request failed: The operation was aborted due to timeout
[SiliconFlowSummarizer] request failed: The operation was aborted due to timeout
[FIX] marking 3 failed rows with [failed:*] placeholder to prevent infinite retry loop
[OpenAITextEmbedder] Response validated: 32 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=32, skipped=15, failed=3)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 4500/4789: ok=2895, skipped=1570, failed=35
[OpenAITextEmbedder] Response validated: 32 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=32, skipped=18, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 4550/4789: ok=2927, skipped=1588, failed=35
[OpenAITextEmbedder] Response validated: 31 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=31, skipped=19, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 4600/4789: ok=2958, skipped=1607, failed=35
[OpenAITextEmbedder] Response validated: 37 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=37, skipped=13, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 4650/4789: ok=2995, skipped=1620, failed=35
[OpenAITextEmbedder] Response validated: 31 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=31, skipped=19, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 4700/4789: ok=3026, skipped=1639, failed=35
[OpenAITextEmbedder] Response validated: 32 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 50 rows (ok=32, skipped=18, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=50
Обработано 4750/4789: ok=3058, skipped=1657, failed=35
[OpenAITextEmbedder] Response validated: 24 embeddings
[FIX] processSummarizeBatch: single updateSummaryWithEmbedding call for 39 rows (ok=24, skipped=15, failed=0)
[ChunkContentStorage] updateSummaryWithEmbedding: count=39
Обработано 4789/4789: ok=3082, skipped=1672, failed=35

Завершено. Обработано=4789, summarized=3082, skipped=1672, failed=35
