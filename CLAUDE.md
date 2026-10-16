# CLAUDE.md

- Kullanıcıyla her zaman Türkçe konuş.

## Proje: AutoMold 3D

Görev tanımı, sabit kararlar, geometri kuralları ve aşama planı: @docs/TASK_BRIEF.md

- Aşamalar sırayla yapılır; her aşama sonunda `ruff check .` ve `pytest -q` yeşil olmalı, kısa özet verilir ve kullanıcının "devam" demesi beklenir.
- Kod, tanımlayıcılar, yorumlar ve commit mesajları İngilizce; arayüz metinleri, hata mesajları ve dokümantasyon Türkçe.
- Linux'ta arayüz testleri sanal ekran gerektirir: `xvfb-run -a pytest -q`.

## MCP sunucuları

MCP araçlarını yalnızca görev gerçekten gerektirdiğinde kullan; yerel dosya okuma, arama ve kabuk komutlarıyla çözülebilen işler için MCP çağırma.

- **context7**: Bir kütüphanenin/framework'ün güncel API'si veya sürüme özgü kullanımı konusunda emin olmadığında dokümantasyon almak için.
- **playwright**: Bir web arayüzünü tarayıcıda açıp test etmek, ekran görüntüsü almak gerektiğinde.
