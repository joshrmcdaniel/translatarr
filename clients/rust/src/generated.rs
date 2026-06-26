// AUTO-GENERATED FILE — DO NOT EDIT.
//
// serde models for the Translatarr API, rendered from
// clients/rust/openapi.json (dumped from the server's Zod schemas in app/lib).
// Regenerate with: clients/rust/scripts/regenerate.sh
#![allow(clippy::redundant_closure_call)]
#![allow(clippy::needless_lifetimes)]
#![allow(clippy::match_single_binding)]
#![allow(clippy::clone_on_copy)]

#[doc = r" Error types."]
pub mod error {
    #[doc = r" Error from a `TryFrom` or `FromStr` implementation."]
    pub struct ConversionError(::std::borrow::Cow<'static, str>);
    impl ::std::error::Error for ConversionError {}
    impl ::std::fmt::Display for ConversionError {
        fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> Result<(), ::std::fmt::Error> {
            ::std::fmt::Display::fmt(&self.0, f)
        }
    }
    impl ::std::fmt::Debug for ConversionError {
        fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> Result<(), ::std::fmt::Error> {
            ::std::fmt::Debug::fmt(&self.0, f)
        }
    }
    impl From<&'static str> for ConversionError {
        fn from(value: &'static str) -> Self {
            Self(value.into())
        }
    }
    impl From<String> for ConversionError {
        fn from(value: String) -> Self {
            Self(value.into())
        }
    }
}
#[doc = "`ApiKey`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"createdAt\","]
#[doc = "    \"expiresAt\","]
#[doc = "    \"id\","]
#[doc = "    \"lastUsedAt\","]
#[doc = "    \"name\","]
#[doc = "    \"prefix\","]
#[doc = "    \"userId\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"createdAt\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"format\": \"date-time\""]
#[doc = "    },"]
#[doc = "    \"expiresAt\": {"]
#[doc = "      \"type\": ["]
#[doc = "        \"string\","]
#[doc = "        \"null\""]
#[doc = "      ],"]
#[doc = "      \"format\": \"date-time\""]
#[doc = "    },"]
#[doc = "    \"id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"lastUsedAt\": {"]
#[doc = "      \"type\": ["]
#[doc = "        \"string\","]
#[doc = "        \"null\""]
#[doc = "      ],"]
#[doc = "      \"format\": \"date-time\""]
#[doc = "    },"]
#[doc = "    \"name\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"prefix\": {"]
#[doc = "      \"description\": \"Leading characters of the token, for display.\","]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"userId\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    }"]
#[doc = "  }"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug, PartialEq)]
pub struct ApiKey {
    #[serde(rename = "createdAt")]
    pub created_at: ::chrono::DateTime<::chrono::offset::Utc>,
    #[serde(rename = "expiresAt")]
    pub expires_at: ::std::option::Option<::chrono::DateTime<::chrono::offset::Utc>>,
    pub id: ::std::string::String,
    #[serde(rename = "lastUsedAt")]
    pub last_used_at: ::std::option::Option<::chrono::DateTime<::chrono::offset::Utc>>,
    pub name: ::std::string::String,
    #[doc = "Leading characters of the token, for display."]
    pub prefix: ::std::string::String,
    #[serde(rename = "userId")]
    pub user_id: ::std::string::String,
}
#[doc = "`ChatDetail`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"allOf\": ["]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/definitions/ChatSummary\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"type\": \"object\","]
#[doc = "      \"required\": ["]
#[doc = "        \"turns\""]
#[doc = "      ],"]
#[doc = "      \"properties\": {"]
#[doc = "        \"turns\": {"]
#[doc = "          \"type\": \"array\","]
#[doc = "          \"items\": {"]
#[doc = "            \"$ref\": \"#/definitions/ChatTurn\""]
#[doc = "          }"]
#[doc = "        }"]
#[doc = "      }"]
#[doc = "    }"]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug, PartialEq)]
pub struct ChatDetail {
    #[serde(rename = "createdAt")]
    pub created_at: ::chrono::DateTime<::chrono::offset::Utc>,
    pub id: ::std::string::String,
    #[serde(rename = "sourceLang")]
    pub source_lang: LanguageCode,
    #[serde(rename = "targetLang")]
    pub target_lang: LanguageCode,
    pub title: ::std::string::String,
    pub turns: ::std::vec::Vec<ChatTurn>,
    #[serde(rename = "updatedAt")]
    pub updated_at: ::chrono::DateTime<::chrono::offset::Utc>,
}
#[doc = "`ChatSummary`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"createdAt\","]
#[doc = "    \"id\","]
#[doc = "    \"sourceLang\","]
#[doc = "    \"targetLang\","]
#[doc = "    \"title\","]
#[doc = "    \"updatedAt\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"createdAt\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"format\": \"date-time\""]
#[doc = "    },"]
#[doc = "    \"id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"sourceLang\": {"]
#[doc = "      \"$ref\": \"#/definitions/LanguageCode\""]
#[doc = "    },"]
#[doc = "    \"targetLang\": {"]
#[doc = "      \"$ref\": \"#/definitions/LanguageCode\""]
#[doc = "    },"]
#[doc = "    \"title\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"updatedAt\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"format\": \"date-time\""]
#[doc = "    }"]
#[doc = "  }"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug, PartialEq)]
pub struct ChatSummary {
    #[serde(rename = "createdAt")]
    pub created_at: ::chrono::DateTime<::chrono::offset::Utc>,
    pub id: ::std::string::String,
    #[serde(rename = "sourceLang")]
    pub source_lang: LanguageCode,
    #[serde(rename = "targetLang")]
    pub target_lang: LanguageCode,
    pub title: ::std::string::String,
    #[serde(rename = "updatedAt")]
    pub updated_at: ::chrono::DateTime<::chrono::offset::Utc>,
}
#[doc = "`ChatTurn`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"branchCount\","]
#[doc = "    \"branchIndex\","]
#[doc = "    \"chatId\","]
#[doc = "    \"createdAt\","]
#[doc = "    \"id\","]
#[doc = "    \"parentId\","]
#[doc = "    \"result\","]
#[doc = "    \"selectedOption\","]
#[doc = "    \"siblingIds\","]
#[doc = "    \"sourceLang\","]
#[doc = "    \"targetLang\","]
#[doc = "    \"text\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"branchCount\": {"]
#[doc = "      \"type\": \"integer\""]
#[doc = "    },"]
#[doc = "    \"branchIndex\": {"]
#[doc = "      \"type\": \"integer\""]
#[doc = "    },"]
#[doc = "    \"chatId\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"createdAt\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"format\": \"date-time\""]
#[doc = "    },"]
#[doc = "    \"id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"parentId\": {"]
#[doc = "      \"description\": \"Parent turn id; null for a root turn.\","]
#[doc = "      \"type\": ["]
#[doc = "        \"string\","]
#[doc = "        \"null\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"result\": {"]
#[doc = "      \"$ref\": \"#/definitions/TranslationResponse\""]
#[doc = "    },"]
#[doc = "    \"selectedOption\": {"]
#[doc = "      \"description\": \"Index into result.translations of the chosen option.\","]
#[doc = "      \"type\": \"integer\""]
#[doc = "    },"]
#[doc = "    \"siblingIds\": {"]
#[doc = "      \"type\": \"array\","]
#[doc = "      \"items\": {"]
#[doc = "        \"type\": \"string\""]
#[doc = "      }"]
#[doc = "    },"]
#[doc = "    \"sourceLang\": {"]
#[doc = "      \"$ref\": \"#/definitions/LanguageCode\""]
#[doc = "    },"]
#[doc = "    \"targetLang\": {"]
#[doc = "      \"$ref\": \"#/definitions/LanguageCode\""]
#[doc = "    },"]
#[doc = "    \"text\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    }"]
#[doc = "  }"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug, PartialEq)]
pub struct ChatTurn {
    #[serde(rename = "branchCount")]
    pub branch_count: i64,
    #[serde(rename = "branchIndex")]
    pub branch_index: i64,
    #[serde(rename = "chatId")]
    pub chat_id: ::std::string::String,
    #[serde(rename = "createdAt")]
    pub created_at: ::chrono::DateTime<::chrono::offset::Utc>,
    pub id: ::std::string::String,
    #[doc = "Parent turn id; null for a root turn."]
    #[serde(rename = "parentId")]
    pub parent_id: ::std::option::Option<::std::string::String>,
    pub result: TranslationResponse,
    #[doc = "Index into result.translations of the chosen option."]
    #[serde(rename = "selectedOption")]
    pub selected_option: i64,
    #[serde(rename = "siblingIds")]
    pub sibling_ids: ::std::vec::Vec<::std::string::String>,
    #[serde(rename = "sourceLang")]
    pub source_lang: LanguageCode,
    #[serde(rename = "targetLang")]
    pub target_lang: LanguageCode,
    pub text: ::std::string::String,
}
#[doc = "`CreatedApiKey`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"apiKey\","]
#[doc = "    \"token\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"apiKey\": {"]
#[doc = "      \"$ref\": \"#/definitions/ApiKey\""]
#[doc = "    },"]
#[doc = "    \"token\": {"]
#[doc = "      \"description\": \"The plaintext token, shown only once.\","]
#[doc = "      \"type\": \"string\""]
#[doc = "    }"]
#[doc = "  }"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug, PartialEq)]
pub struct CreatedApiKey {
    #[serde(rename = "apiKey")]
    pub api_key: ApiKey,
    #[doc = "The plaintext token, shown only once."]
    pub token: ::std::string::String,
}
#[doc = "`Error`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"error\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"code\": {"]
#[doc = "      \"description\": \"Provider error code, when applicable.\","]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"error\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    }"]
#[doc = "  }"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug, PartialEq)]
pub struct Error {
    #[doc = "Provider error code, when applicable."]
    #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
    pub code: ::std::option::Option<::std::string::String>,
    pub error: ::std::string::String,
}
#[doc = "`KeyWord`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"romanization\","]
#[doc = "    \"source\","]
#[doc = "    \"target\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"romanization\": {"]
#[doc = "      \"description\": \"Romanization of target when it is written in a non-Latin script; otherwise null.\","]
#[doc = "      \"anyOf\": ["]
#[doc = "        {"]
#[doc = "          \"type\": \"string\""]
#[doc = "        },"]
#[doc = "        {"]
#[doc = "          \"type\": \"null\""]
#[doc = "        }"]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"source\": {"]
#[doc = "      \"description\": \"A meaningful word or phrase exactly as it appears in the source text.\","]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"target\": {"]
#[doc = "      \"description\": \"Its counterpart in this specific translation option.\","]
#[doc = "      \"type\": \"string\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct KeyWord {
    #[doc = "Romanization of target when it is written in a non-Latin script; otherwise null."]
    pub romanization: ::std::option::Option<::std::string::String>,
    #[doc = "A meaningful word or phrase exactly as it appears in the source text."]
    pub source: ::std::string::String,
    #[doc = "Its counterpart in this specific translation option."]
    pub target: ::std::string::String,
}
#[doc = "A supported language code, or \"auto\" for source detection."]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"description\": \"A supported language code, or \\\"auto\\\" for source detection.\","]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"en\","]
#[doc = "    \"ar\","]
#[doc = "    \"yue\","]
#[doc = "    \"zh\","]
#[doc = "    \"cs\","]
#[doc = "    \"nl\","]
#[doc = "    \"fi\","]
#[doc = "    \"fr\","]
#[doc = "    \"de\","]
#[doc = "    \"el\","]
#[doc = "    \"he\","]
#[doc = "    \"hu\","]
#[doc = "    \"id\","]
#[doc = "    \"it\","]
#[doc = "    \"ja\","]
#[doc = "    \"km\","]
#[doc = "    \"ko\","]
#[doc = "    \"mn\","]
#[doc = "    \"fa\","]
#[doc = "    \"pl\","]
#[doc = "    \"pt\","]
#[doc = "    \"ro\","]
#[doc = "    \"ru\","]
#[doc = "    \"es\","]
#[doc = "    \"sv\","]
#[doc = "    \"tl\","]
#[doc = "    \"th\","]
#[doc = "    \"uk\","]
#[doc = "    \"vi\","]
#[doc = "    \"auto\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum LanguageCode {
    #[serde(rename = "en")]
    En,
    #[serde(rename = "ar")]
    Ar,
    #[serde(rename = "yue")]
    Yue,
    #[serde(rename = "zh")]
    Zh,
    #[serde(rename = "cs")]
    Cs,
    #[serde(rename = "nl")]
    Nl,
    #[serde(rename = "fi")]
    Fi,
    #[serde(rename = "fr")]
    Fr,
    #[serde(rename = "de")]
    De,
    #[serde(rename = "el")]
    El,
    #[serde(rename = "he")]
    He,
    #[serde(rename = "hu")]
    Hu,
    #[serde(rename = "id")]
    Id,
    #[serde(rename = "it")]
    It,
    #[serde(rename = "ja")]
    Ja,
    #[serde(rename = "km")]
    Km,
    #[serde(rename = "ko")]
    Ko,
    #[serde(rename = "mn")]
    Mn,
    #[serde(rename = "fa")]
    Fa,
    #[serde(rename = "pl")]
    Pl,
    #[serde(rename = "pt")]
    Pt,
    #[serde(rename = "ro")]
    Ro,
    #[serde(rename = "ru")]
    Ru,
    #[serde(rename = "es")]
    Es,
    #[serde(rename = "sv")]
    Sv,
    #[serde(rename = "tl")]
    Tl,
    #[serde(rename = "th")]
    Th,
    #[serde(rename = "uk")]
    Uk,
    #[serde(rename = "vi")]
    Vi,
    #[serde(rename = "auto")]
    Auto,
}
impl ::std::fmt::Display for LanguageCode {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::En => f.write_str("en"),
            Self::Ar => f.write_str("ar"),
            Self::Yue => f.write_str("yue"),
            Self::Zh => f.write_str("zh"),
            Self::Cs => f.write_str("cs"),
            Self::Nl => f.write_str("nl"),
            Self::Fi => f.write_str("fi"),
            Self::Fr => f.write_str("fr"),
            Self::De => f.write_str("de"),
            Self::El => f.write_str("el"),
            Self::He => f.write_str("he"),
            Self::Hu => f.write_str("hu"),
            Self::Id => f.write_str("id"),
            Self::It => f.write_str("it"),
            Self::Ja => f.write_str("ja"),
            Self::Km => f.write_str("km"),
            Self::Ko => f.write_str("ko"),
            Self::Mn => f.write_str("mn"),
            Self::Fa => f.write_str("fa"),
            Self::Pl => f.write_str("pl"),
            Self::Pt => f.write_str("pt"),
            Self::Ro => f.write_str("ro"),
            Self::Ru => f.write_str("ru"),
            Self::Es => f.write_str("es"),
            Self::Sv => f.write_str("sv"),
            Self::Tl => f.write_str("tl"),
            Self::Th => f.write_str("th"),
            Self::Uk => f.write_str("uk"),
            Self::Vi => f.write_str("vi"),
            Self::Auto => f.write_str("auto"),
        }
    }
}
impl ::std::str::FromStr for LanguageCode {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "en" => Ok(Self::En),
            "ar" => Ok(Self::Ar),
            "yue" => Ok(Self::Yue),
            "zh" => Ok(Self::Zh),
            "cs" => Ok(Self::Cs),
            "nl" => Ok(Self::Nl),
            "fi" => Ok(Self::Fi),
            "fr" => Ok(Self::Fr),
            "de" => Ok(Self::De),
            "el" => Ok(Self::El),
            "he" => Ok(Self::He),
            "hu" => Ok(Self::Hu),
            "id" => Ok(Self::Id),
            "it" => Ok(Self::It),
            "ja" => Ok(Self::Ja),
            "km" => Ok(Self::Km),
            "ko" => Ok(Self::Ko),
            "mn" => Ok(Self::Mn),
            "fa" => Ok(Self::Fa),
            "pl" => Ok(Self::Pl),
            "pt" => Ok(Self::Pt),
            "ro" => Ok(Self::Ro),
            "ru" => Ok(Self::Ru),
            "es" => Ok(Self::Es),
            "sv" => Ok(Self::Sv),
            "tl" => Ok(Self::Tl),
            "th" => Ok(Self::Th),
            "uk" => Ok(Self::Uk),
            "vi" => Ok(Self::Vi),
            "auto" => Ok(Self::Auto),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for LanguageCode {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for LanguageCode {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for LanguageCode {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`Ok`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"ok\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"ok\": {"]
#[doc = "      \"type\": \"boolean\","]
#[doc = "      \"const\": true"]
#[doc = "    }"]
#[doc = "  }"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug, PartialEq)]
pub struct Ok {
    pub ok: bool,
}
#[doc = "`Translation`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"keyWords\","]
#[doc = "    \"romanization\","]
#[doc = "    \"sourceEquivalent\","]
#[doc = "    \"text\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"keyWords\": {"]
#[doc = "      \"description\": \"Complete glossary for this option, in source order: every meaningful word or phrase of the source text mapped to its counterpart in this option (omit only pure function words).\","]
#[doc = "      \"default\": [],"]
#[doc = "      \"type\": \"array\","]
#[doc = "      \"items\": {"]
#[doc = "        \"$ref\": \"#/definitions/KeyWord\""]
#[doc = "      }"]
#[doc = "    },"]
#[doc = "    \"register\": {"]
#[doc = "      \"description\": \"Formality of this option's phrasing: formal, polite, neutral, casual, intimate, or vulgar/slang, with the language's native politeness or speech-level term in parentheses when one exists. Casual means relaxed but clean; phrasing with profanity or crude/sexual vocabulary is vulgar/slang; sexually familiar talk between partners is intimate.\","]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"romanization\": {"]
#[doc = "      \"description\": \"Romanization of text when it is written in a non-Latin script (pinyin, romaji, etc.); otherwise null.\","]
#[doc = "      \"anyOf\": ["]
#[doc = "        {"]
#[doc = "          \"type\": \"string\""]
#[doc = "        },"]
#[doc = "        {"]
#[doc = "          \"type\": \"null\""]
#[doc = "        }"]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"sourceEquivalent\": {"]
#[doc = "      \"description\": \"Back-translation of text into the source language so the user can verify the meaning.\","]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"text\": {"]
#[doc = "      \"description\": \"The translation itself, in the output language.\","]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"tone\": {"]
#[doc = "      \"description\": \"Attitude or emotional coloring of this option's phrasing — a separate axis from register's formality. Prefer one of: playful, teasing, mocking, affectionate, flirtatious, sarcastic, angry, urgent, somber, excited; coin a more precise single word when none fits. Omit entirely when the phrasing is emotionally neutral.\","]
#[doc = "      \"type\": \"string\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Translation {
    #[doc = "Complete glossary for this option, in source order: every meaningful word or phrase of the source text mapped to its counterpart in this option (omit only pure function words)."]
    #[serde(rename = "keyWords")]
    pub key_words: ::std::vec::Vec<KeyWord>,
    #[doc = "Formality of this option's phrasing: formal, polite, neutral, casual, intimate, or vulgar/slang, with the language's native politeness or speech-level term in parentheses when one exists. Casual means relaxed but clean; phrasing with profanity or crude/sexual vocabulary is vulgar/slang; sexually familiar talk between partners is intimate."]
    #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
    pub register: ::std::option::Option<::std::string::String>,
    #[doc = "Romanization of text when it is written in a non-Latin script (pinyin, romaji, etc.); otherwise null."]
    pub romanization: ::std::option::Option<::std::string::String>,
    #[doc = "Back-translation of text into the source language so the user can verify the meaning."]
    #[serde(rename = "sourceEquivalent")]
    pub source_equivalent: ::std::string::String,
    #[doc = "The translation itself, in the output language."]
    pub text: ::std::string::String,
    #[doc = "Attitude or emotional coloring of this option's phrasing — a separate axis from register's formality. Prefer one of: playful, teasing, mocking, affectionate, flirtatious, sarcastic, angry, urgent, somber, excited; coin a more precise single word when none fits. Omit entirely when the phrasing is emotionally neutral."]
    #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
    pub tone: ::std::option::Option<::std::string::String>,
}
#[doc = "`TranslationResponse`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"confidence\","]
#[doc = "    \"detectedSourceLanguage\","]
#[doc = "    \"keyWords\","]
#[doc = "    \"translations\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"confidence\": {"]
#[doc = "      \"description\": \"Confidence in the language detection, from 0 to 1.\","]
#[doc = "      \"type\": \"number\""]
#[doc = "    },"]
#[doc = "    \"detectedSourceLanguage\": {"]
#[doc = "      \"description\": \"Code of the language the input text is actually written in (e.g. \\\"en\\\", \\\"zh\\\").\","]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"keyWords\": {"]
#[doc = "      \"description\": \"Legacy shared glossary; always return an empty array — each translation option carries its own keyWords.\","]
#[doc = "      \"default\": [],"]
#[doc = "      \"type\": \"array\","]
#[doc = "      \"items\": {"]
#[doc = "        \"$ref\": \"#/definitions/KeyWord\""]
#[doc = "      }"]
#[doc = "    },"]
#[doc = "    \"translations\": {"]
#[doc = "      \"description\": \"2-3 natural translation options, ranked best-first.\","]
#[doc = "      \"type\": \"array\","]
#[doc = "      \"items\": {"]
#[doc = "        \"$ref\": \"#/definitions/Translation\""]
#[doc = "      }"]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct TranslationResponse {
    #[doc = "Confidence in the language detection, from 0 to 1."]
    pub confidence: f64,
    #[doc = "Code of the language the input text is actually written in (e.g. \"en\", \"zh\")."]
    #[serde(rename = "detectedSourceLanguage")]
    pub detected_source_language: ::std::string::String,
    #[doc = "Legacy shared glossary; always return an empty array — each translation option carries its own keyWords."]
    #[serde(rename = "keyWords")]
    pub key_words: ::std::vec::Vec<KeyWord>,
    #[doc = "2-3 natural translation options, ranked best-first."]
    pub translations: ::std::vec::Vec<Translation>,
}
