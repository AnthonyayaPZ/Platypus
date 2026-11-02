package com.anthonyaya.platypus.data.model

import com.google.gson.Gson
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Test

class ApiModelsTest {
    private val gson = Gson()

    @Test
    fun `search response maps camel case word fields`() {
        val response = gson.fromJson(
            """
            {
              "entry": {
                "word": "resilient",
                "phonetic": "/test/",
                "part": "adj.",
                "meaning": "有韧性的",
                "summary": "能够恢复",
                "example": "A resilient team recovers.",
                "exampleZh": "有韧性的团队能够恢复。",
                "synonyms": ["tough", "adaptable"],
                "antonyms": ["fragile", "vulnerable"],
                "relations": []
              },
              "source": "server-dictionary"
            }
            """.trimIndent(),
            SearchResponse::class.java,
        )

        assertNotNull(response.entry)
        assertEquals("resilient", response.entry?.word)
        assertEquals("有韧性的团队能够恢复。", response.entry?.exampleZh)
        assertEquals(listOf("tough", "adaptable"), response.entry?.synonyms)
    }

    @Test
    fun `state response maps server snake case fields`() {
        val response = gson.fromJson(
            """
            {
              "groups": [{
                "id": "group-default",
                "name": "默认词库",
                "color": "#d7a545",
                "is_default": 1,
                "word_count": 4,
                "due_count": 2
              }],
              "savedWords": [],
              "wordMeta": []
            }
            """.trimIndent(),
            StateResponse::class.java,
        )

        assertEquals(1, response.groups.single().isDefault)
        assertEquals(4, response.groups.single().wordCount)
        assertEquals(2, response.groups.single().dueCount)
    }
}

