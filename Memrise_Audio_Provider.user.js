// ==UserScript==
// @name           Memrise Audio Provider
// @namespace      https://github.com/cooljingle
// @description    Provides generated audio from google's TTS api 
// @match          http://www.memrise.com/course/*/garden/*
// @match          http://www.memrise.com/garden/review/*
// @version        0.0.13
// @updateURL      https://github.com/cooljingle/memrise-audio-provider/raw/master/Memrise_Audio_Provider.user.js
// @downloadURL    https://github.com/cooljingle/memrise-audio-provider/raw/master/Memrise_Audio_Provider.user.js
// @grant          none
// ==/UserScript==

var audioPlaying = false,
    courseId,
    language,
    linkHtml = $([
        "<a id='audio-provider-link'>Audio Provider</a>",
        "<div id='audio-provider-box' style='display:none'>",
        "   <em style='font-size:85%'>audio for this course:",
        "   </em><select id='audio-provider-options'></select>",
        "   <hr/>",
        "   <em style='font-size:85%'>Voice RSS key:",
        "   <input id='audio-provider-voicerss' type='text' placeholder='enter Voice RSS key'>",
        "</div>"
    ].join("\n")),
    localStorageIdentifier = "memrise-audio-provider",
    localStorageVoiceRssIdentifier = "memrise-audio-provider-voicerss",
    savedChoices = JSON.parse(localStorage.getItem(localStorageIdentifier)) || {},
    speechSynthesisUtterance = window.speechSynthesis && new window.SpeechSynthesisUtterance(),
    ttsFailed = false,
    voiceRssKey = localStorage.getItem(localStorageVoiceRssIdentifier) || "",
    word,
    wordColumn = 1;

$('#left-area').append(linkHtml);
$('#audio-provider-link').click(function() {
    $('#audio-provider-box').toggle();
});
$('#audio-provider-voicerss').val(voiceRssKey);
$('#audio-provider-voicerss').change(function() {
    localStorage.setItem(localStorageVoiceRssIdentifier, $(this).val());
});

//required to get google's tts working
var meta = document.createElement('meta');
meta.name = "referrer";
meta.content = "no-referrer";
document.getElementsByTagName('head')[0].appendChild(meta);

MEMRISE.garden.boxes.load = (function() {
    var cached_function = MEMRISE.garden.boxes.load;
    return function() {
        var result = cached_function.apply(this, arguments);
        language = MEMRISE.garden.session.category.name;
        if (speechSynthesisUtterance) {
            var langCode = speechSynthesisLanguageCodes[language];
            speechSynthesisUtterance.lang = langCode || "";
            speechSynthesisUtterance.voice = speechSynthesis.getVoices().filter(function (voice) {return voice.lang === langCode; })[0];
        }

        _.each(MEMRISE.garden.box_types, function(box_type) {
            box_type.prototype.activate = (function() {
                var cached_function = box_type.prototype.activate;
                return function() {
                    if (["end_of_session", "speed-count-down"].indexOf(this.template) < 0) {
                        var newCourseId = getCourseId(this);
                        if (courseId !== newCourseId) {
                            courseId = newCourseId;
                            editAudioOptions(this);
                        }
                        if (wordColumn > 0) {
                            injectAudioIfRequired(this);
                            word = this.thing.columns[wordColumn].val;
                        }
                    }
                    var result = cached_function.apply(this, arguments);
                    return result;
                };
            }());
        });

        MEMRISE.renderer.fixMediaUrl = (function() {
            var cached_function = MEMRISE.renderer.fixMediaUrl;
            return function() {
                if (arguments[0] === "AUDIO_PROVIDER") {
                    return "";
                } else {
                    return cached_function.apply(this, arguments);
                }
            };
        }());

        MEMRISE.audioPlayer.play = (function() {
            var cached_function = MEMRISE.audioPlayer.play;
            return function() {
                var shouldGenerateAudio = (arguments[0].url === "");
                if (shouldGenerateAudio && !audioPlaying) {
                    playGeneratedAudio();
                } else {
                    cached_function.apply(this, arguments);
                }
            };
        }());

        return result;
    };
}());

function canSpeechSynthesize() {
    return !!(speechSynthesisUtterance && speechSynthesisUtterance.lang);
}

function editAudioOptions(context) {
    $('#audio-provider-options').empty();
    var columns = context.pool.columns;
    _.each($.extend({
        0: {
            kind: "text",
            label: "No audio"
        }
    }, columns), function(v, k) {
        if (v.kind === "text") {
            $('#audio-provider-options').append('<option value="' + k + '">' + v.label + '</option>');
        }
    });
    wordColumn = savedChoices[courseId] || 1;
    $('#audio-provider-options').val(savedChoices[courseId] || 1);
    $('#audio-provider-options').change(function() {
        wordColumn = $(this).val();
        savedChoices[courseId] = wordColumn;
        localStorage.setItem(localStorageIdentifier, JSON.stringify(savedChoices));
        if (wordColumn > 0) {
            word = context.thing.columns[wordColumn].val;
        }
    });
}

function getAudioColumn(context) {
    var audioColumnNumber = _.findKey(context.pool.columns, function(c) {
        return c.kind === "audio";
    });
    return context.thing.columns[audioColumnNumber] || _.find(context.thing.columns, function(c) {return c.val[0].url === "AUDIO_PROVIDER";} );
}

function getAudioLink() {
    return getTtsUrl() || getVoiceRssUrl();
}

function getCourseId(context) {
    return context.course_id || MEMRISE.garden.session_params.course_id || MEMRISE.garden.session_data.thinguser_course_ids[context.thing_id + "-" + context.column_a + "-" + context.column_b];
}

function getTtsUrl() {
    var languageCode = ttsLanguageCodes[language];
    if (languageCode && !ttsFailed) {
        return "http://translate.google.com/translate_tts?ie=UTF-8&tl=" + languageCode + "&client=tw-ob&q=" + encodeURIComponent(word) + "&tk=" + Math.floor(Math.random() * 1000000); //helps stop google from complaining about too many requests;
    }
}

function getVoiceRssUrl() {
    var languageCode = voiceRssLanguageCodes[language];
    if (languageCode && voiceRssKey) {
        return 'http://api.voicerss.org/?key=' + voiceRssKey + '&src=' + encodeURIComponent(word) + '&hl=' + languageCode + '&f=48khz_16bit_stereo';
    }
}

function isValidLanguage() {
    return canSpeechSynthesize() || !!(getAudioLink());
}

function injectAudioIfRequired(context) {
    if(isValidLanguage()) {
        $('#audio-provider-link').show();
        var column = getAudioColumn(context);
        if(!column) {
            var poolColumns = context.pool.columns,
                thingColumns = context.thing.columns,
                newColumnNo = Object.keys(poolColumns).length + 1;

            poolColumns[newColumnNo] = {
                always_show: false,
                classes: [],
                keyboard: "",
                kind: "audio",
                label: "Audio",
                tapping_disabled: false,
                typing_disabled: false,
                typing_strict: false
            };
            thingColumns[newColumnNo] = {
                accepted: [],
                alts: [],
                choices: [],
                typing_corrects: {},
                val: []
            };
            column = thingColumns[newColumnNo];
        } 
        if (column.val.length === 0) {
            column.val = [{
                url: "AUDIO_PROVIDER",
                id: 1
            }];
        }
    } else {
        console.log("language '" + language + "' is invalid for audio generation");
        $('#audio-provider-link').hide();
    }
}

function playGeneratedAudio() {
    if (canSpeechSynthesize()) {
        playSpeechSynthesisAudio();
    } else {
        var audioLink = getAudioLink();
        playLinkGeneratedAudio(audioLink);
    }
}

function playLinkGeneratedAudio(audioLink) {
    var audioElement = document.createElement('audio');
    audioElement.setAttribute('src', audioLink);
    audioElement.addEventListener('error', function(e) {
        ttsFailed = true;
        if(voiceRssKey) {
            var alternateSrc = getVoiceRssUrl();
            if(e.target.currentSrc !== alternateSrc) {
                console.log("tts failed, switching to voiceRss");
                audioElement.setAttribute('src', alternateSrc);
                audioElement.play();
            }
        }
    });
    audioElement.play();
    audioPlaying = true;
    $(audioElement).on('ended', function() {
        audioPlaying = false;
    });
}

function playSpeechSynthesisAudio() {
    console.log("generating speechSynthesis audio for word: " + word);
    speechSynthesisUtterance.text = word;
    window.speechSynthesis.speak(speechSynthesisUtterance);
    audioPlaying = true;
    speechSynthesisUtterance.onend = function(event) {
        audioPlaying = false;
    };
}

var speechSynthesisLanguageCodes = {
    "German": "de-DE",
    "English": "en-GB",
    "Spanish": "es-ES",
    "French": "fr-FR",
    "Hindi": "hi-IN",
    "Indonesian": "id-ID",
    "Italian": "it-IT",
    "Japanese": "ja-JP",
    "Korean": "ko-KR",
    "Dutch": "nl-NL",
    "Polish": "pl-PL",
    "Portuguese (Brazil)": "pt-BR",
    "Russian": "ru-RU",
    "Mandarin Chinese (Simplified)": "zh-CN",
    "Cantonese": "zh-HK",
    "Chinese (Traditional)": "zh-TW"
};

var ttsLanguageCodes = {
    "Afrikaans": "af",
    "Albanian": "sq",
    "Amharic": "am",
    "Arabic": "ar",
    "Armenian": "hy",
    "Azerbaijani": "az",
    "Basque": "eu",
    "Belarusian": "be",
    "Bengali": "bn",
    "Bihari": "bh",
    "Bosnian": "bs",
    "Breton": "br",
    "Bulgarian": "bg",
    "Cambodian": "km",
    "Catalan": "ca",
    "Mandarin Chinese (Simplified)": "zh-CN",
    "Chinese (Traditional)": "zh-TW",
    "Corsican": "co",
    "Croatian": "hr",
    "Czech": "cs",
    "Danish": "da",
    "Dutch": "nl",
    "English": "en",
    "Esperanto": "eo",
    "Estonian": "et",
    "Faroese": "fo",
    "Filipino": "tl",
    "Finnish": "fi",
    "French": "fr",
    "Frisian": "fy",
    "Galician": "gl",
    "Georgian": "ka",
    "German": "de",
    "Greek": "el",
    "Guarani": "gn",
    "Gujarati": "gu",
    "Hausa": "ha",
    "Hebrew": "iw",
    "Hindi": "hi",
    "Hungarian": "hu",
    "Icelandic": "is",
    "Indonesian": "id",
    "Interlingua": "ia",
    "Irish": "ga",
    "Italian": "it",
    "Japanese": "ja",
    "Javanese": "jw",
    "Kannada": "kn",
    "Kazakh": "kk",
    "Kinyarwanda": "rw",
    "Kirundi": "rn",
    "Korean": "ko",
    "Kurdish": "ku",
    "Kyrgyz": "ky",
    "Laothian": "lo",
    "Latin": "la",
    "Latvian": "lv",
    "Lingala": "ln",
    "Lithuanian": "lt",
    "Macedonian": "mk",
    "Malagasy": "mg",
    "Malay": "ms",
    "Malayalam": "ml",
    "Maltese": "mt",
    "Maori": "mi",
    "Marathi": "mr",
    "Moldavian": "mo",
    "Mongolian": "mn",
    "Montenegrin": "sr-ME",
    "Nepali": "ne",
    "Norwegian": "no",
    "Norwegian (Nynorsk)": "nn",
    "Occitan": "oc",
    "Oriya": "or",
    "Oromo": "om",
    "Pashto": "ps",
    "Persian": "fa",
    "Polish": "pl",
    "Portuguese (Brazil)": "pt-BR",
    "Portuguese (Portugal)": "pt-PT",
    "Punjabi": "pa",
    "Quechua": "qu",
    "Romanian": "ro",
    "Romansh": "rm",
    "Russian": "ru",
    "Scots Gaelic": "gd",
    "Serbian": "sr",
    "Serbo-Croatian": "sh",
    "Sesotho": "st",
    "Shona": "sn",
    "Sindhi": "sd",
    "Sinhalese": "si",
    "Slovak": "sk",
    "Slovenian": "sl",
    "Somali": "so",
    "Spanish": "es",
    "Sundanese": "su",
    "Swahili": "sw",
    "Swedish": "sv",
    "Tajik": "tg",
    "Tamil": "ta",
    "Tatar": "tt",
    "Telugu": "te",
    "Thai": "th",
    "Tigrinya": "ti",
    "Tonga": "to",
    "Turkish": "tr",
    "Turkmen": "tk",
    "Twi": "tw",
    "Uighur": "ug",
    "Ukrainian": "uk",
    "Urdu": "ur",
    "Uzbek": "uz",
    "Vietnamese": "vi",
    "Welsh": "cy",
    "Xhosa": "xh",
    "Yiddish": "yi",
    "Yoruba": "yo",
    "Zulu": "zu"
};

var voiceRssLanguageCodes = {
    "Catalan": "ca-es",
    "Mandarin Chinese (Simplified)": "zh-cn",
    "Chinese (Traditional)": "zh-tw",
    "Danish": "da-dk",
    "Dutch": "nl-nl",
    "English": "en-gb",
    "fi-fi": "fi",
    "French": "fr-fr",
    "German": "de-de",
    "Italian": "it-it",
    "Japanese": "ja-jp",
    "Korean": "ko-kr",
    "Norwegian": "nb-no",
    "Polish": "pl-pl",
    "Portuguese (Brazil)": "pt-br",
    "Portuguese (Portugal)": "pt-pt",
    "Russian": "ru-ru",
    "Spanish": "es-es",
    "Swedish": "sv-se"
}
