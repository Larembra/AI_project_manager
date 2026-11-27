MAX_UNTRUSTED_TEXT = 12000


def mark_untrusted_text(value: str, source: str, limit: int = MAX_UNTRUSTED_TEXT) -> str:
    bounded = value[:max(0, limit)].replace("</", "< /")
    return f"<untrusted-data source=\"{source}\">\n{bounded}\n</untrusted-data>"
