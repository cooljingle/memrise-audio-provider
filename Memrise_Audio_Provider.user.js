// ==UserScript==
// @name           Memrise Audio Provider
// @namespace      https://github.com/cooljingle
// @description    Provides audio for any items you are learning which have none.
// @match          https://www.memrise.com/course/*/garden/*
// @match          https://www.memrise.com/garden/review/*
// @version        0.1.5
// @updateURL      https://github.com/cooljingle/memrise-audio-provider/raw/master/Memrise_Audio_Provider.user.js
// @downloadURL    https://github.com/cooljingle/memrise-audio-provider/raw/master/Memrise_Audio_Provider.user.js
// @grant          none
// ==/UserScript==

$(document).ready(function () {
    var cachedAudioElements = [],
        courseId,
        currentWord,
        isNetworkBusy,
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
        localStorageIdentifier = "memrise-audio-provider-storage",
        localStorageVoiceRssIdentifier = "memrise-audio-provider-voicerss",
        savedChoices = JSON.parse(localStorage.getItem(localStorageIdentifier)) || {},
        speechSynthesisPlaying,
        speechSynthesisUtterance = window.speechSynthesis && new window.SpeechSynthesisUtterance(),
        voiceRssKey = localStorage.getItem(localStorageVoiceRssIdentifier) || "",
        wordColumn = "item";

    var canSpeechSynthesize = false,
        canGoogleTts = true,
        canVoiceRss = !!voiceRssKey;

    $('#left-area').append(linkHtml);
    $('#audio-provider-link').click(function () {
        $('#audio-provider-box').toggle();
    });
    $('#audio-provider-voicerss').val(voiceRssKey);
    $('#audio-provider-voicerss').change(function () {
        localStorage.setItem(localStorageVoiceRssIdentifier, $(this).val());
    });

    //required to get google tts working
    var meta = document.createElement('meta');
    meta.name = "referrer";
    meta.content = "origin";
    document.getElementsByTagName('head')[0].appendChild(meta);

    MEMRISE.garden.boxes.load = (function () {
        var cached_function = MEMRISE.garden.boxes.load;
        return function () {
            var result = cached_function.apply(this, arguments);
            language = MEMRISE.garden.session.category.name;
            if (speechSynthesisUtterance) {
                var langCode = speechSynthesisLanguageCodes[language];
                speechSynthesisUtterance.lang = langCode || "";
                speechSynthesisUtterance.voice = speechSynthesis.getVoices().filter(function (voice) {
                    return voice.lang === langCode;
                })[0];
                canSpeechSynthesize = !!(speechSynthesisUtterance.lang && speechSynthesisUtterance.voice);
            }

            _.each(MEMRISE.garden.box_types, function (box_type) {
                box_type.prototype.activate = (function () {
                    var cached_function = box_type.prototype.activate;
                    return function () {
                        if (["end_of_session", "speed-count-down"].indexOf(this.template) < 0) {
                            var newCourseId = getCourseId(this);
                            if (courseId !== newCourseId) {
                                courseId = newCourseId;
                                editAudioOptions(this);
                            }
                            if (wordColumn !== "none") {
                                var isInjected = injectAudioIfRequired(this);
                                currentWord = this.learnable[wordColumn].value;
                                if (isInjected && !canSpeechSynthesize && canGoogleTts) {
                                    preloadGoogleTts(currentWord); //required as we change referrer header while loading, which we don't want to conflict with memrise calls
                                }
                            }
                        }
                        var result = cached_function.apply(this, arguments);
                        return result;
                    };
                }());
            });

            MEMRISE.renderer.fixMediaUrl = (function () {
                var cached_function = MEMRISE.renderer.fixMediaUrl;
                return function () {
                    if (arguments[0] === "AUDIO_PROVIDER" || (_.isArray(arguments[0]) && arguments[0][0] === "AUDIO_PROVIDER")) {
                        return "";
                    } else {
                        return cached_function.apply(this, arguments);
                    }
                };
            }());

            MEMRISE.audioPlayer.play = (function () {
                var cached_function = MEMRISE.audioPlayer.play;
                return function () {
                    var shouldGenerateAudio = (arguments[0].url === "");
                    if (shouldGenerateAudio) {
                        playGeneratedAudio(currentWord);
                    } else {
                        cached_function.apply(this, arguments);
                    }
                };
            }());

            return result;
        };
    }());

    function editAudioOptions(context) {
        $('#audio-provider-options').empty();
        _.each({
            none: {
                kind: "text",
                label: "No audio"
            },
            item: context.learnable.item,
            definition: context.learnable.definition
        }, function (v, k) {
            if (v.kind === "text") {
                $('#audio-provider-options').append('<option value="' + k + '">' + v.label + '</option>');
            }
        });
        wordColumn = savedChoices[courseId] || "item";
        $('#audio-provider-options').val(savedChoices[courseId] || "item");
        $('#audio-provider-options').change(function () {
            wordColumn = $(this).val();
            savedChoices[courseId] = wordColumn;
            localStorage.setItem(localStorageIdentifier, JSON.stringify(savedChoices));
            if (wordColumn !== "none") {
                currentWord = context.learnable[wordColumn].value;
            }
        });
    }

    function getAudioColumn(context) {
        var audioColumnNumber = _.findKey(context.learnable.columns, function (c) {
            return c.kind === "audio";
        });
        return context.learnable.columns[audioColumnNumber] || _.find(context.learnable.columns, function (c) {
            return c && c.value && c.value[0] === "AUDIO_PROVIDER";
        });
    }

    function getCachedElement(source, word) {
        var cachedElem = cachedAudioElements.find(function (obj) {
            return obj.source === source && obj.word === word;
        });
        return cachedElem && cachedElem.element;
    }

    function removeCachedElement(source, word) {
        var cachedElem = cachedAudioElements.find(function (obj) {
            return obj.source === source && obj.word === word;
        });
        if (cachedElem) {
            cachedElem.source = cachedElem.element = undefined;
        }
    }

    function setCachedElement(source, word, element) {
        cachedAudioElements.push({
            source: source,
            word: word,
            element: element
        });
    }

    function getCourseId(context) {
        return context.course_id || MEMRISE.garden.session_params.course_id || MEMRISE.garden.session_data.things_to_courses[context.thinguser.thing_id];
    }

    function injectAudioIfRequired(context) {
        if (canSpeechSynthesize || canGoogleTts || canVoiceRss) {
            $('#audio-provider-link').show();
            var column = getAudioColumn(context);
            if (!column) {
                var columns = context.learnable.columns;
                column = {
                    alternatives: [],
                    always_show: false,
                    classes: [],
                    keyboard: "",
                    kind: "audio",
                    label: "Audio",
                    tapping_disabled: false,
                    typing_disabled: false,
                    typing_strict: false
                };
                columns.push(column);
            }
            column.kind = "audio";
            if (!column.value || column.value.length === 0) {
                column.value = ["AUDIO_PROVIDER"];
                context.learnable.audios.push("AUDIO_PROVIDER");
                return true;
            }
        } else {
            log("could not find a way to generate audio for language" + language);
            $('#audio-provider-link').hide();
        }
    }

    function log(message) {
        console.log("Audio Provider: " + message);
    }

    function playGeneratedAudio(word) {
        if (canSpeechSynthesize) {
            playSpeechSynthesisAudio(word);
        } else if (canGoogleTts) {
            playGoogleTtsAudio(word);
        } else if (canVoiceRss) {
            playVoiceRssAudio(word);
        } else {
            log("no playable sources found");
        }
    }

    function playSpeechSynthesisAudio(word) {
        if(!speechSynthesisPlaying){
            log("generating speechSynthesis audio for word: " + word);
            speechSynthesisUtterance.text = word;
            window.speechSynthesis.speak(speechSynthesisUtterance);
            speechSynthesisPlaying = true;
            speechSynthesisUtterance.onend = function (event) {
                speechSynthesisPlaying = false;
                //firefox utterances don't play more than once
                if (navigator.userAgent.search("Firefox") > -1) {
                    var lang = speechSynthesisUtterance.lang,
                        voice = speechSynthesisUtterance.voice,
                        test = speechSynthesisUtterance.text;
                    speechSynthesisUtterance = new window.SpeechSynthesisUtterance();
                    speechSynthesisUtterance.lang = lang;
                    speechSynthesisUtterance.voice = voice;
                    speechSynthesisUtterance.text = text;
                }
            };
        }
    }

    function playGoogleTtsAudio(word) {
        var audioElement = getGoogleTtsElement(word);
        if (audioElement) {
            audioElement.play();
        } else {
            canGoogleTts = false;
            playGeneratedAudio(word);
        }
    }

    function getGoogleTtsElement(word) {
        var languageCode = googleTtsLanguageCodes[language],
            source = "google tts",
            cachedElement = getCachedElement(source, word);

        if (languageCode) {
            if (cachedElement) {
                return cachedElement;
            } else {
                log("generating google tts link for word: " + word);
                var url = "https://translate.google.com/translate_tts?ie=UTF-8&tl=" + languageCode + "&client=tw-ob&q=" + encodeURIComponent(word) + "&tk=" + Math.floor(Math.random() * 1000000); //helps stop google from complaining about too many requests;
                document.getElementsByName("referrer")[0].setAttribute("content", "no-referrer");
                var audioElement = makeAudioElement(source, word, url, function (e) {
                    canGoogleTts = false;
                });
                $(audioElement).on('loadeddata', function () {
                    document.getElementsByName("referrer")[0].setAttribute("content", "origin");
                });
                return audioElement;
            }
        }
    }

    function preloadGoogleTts(word) {
        if (isNetworkBusy) {
            log("network busy - delaying google tts preload");
            setTimeout(function(){
                preloadGoogleTts(word);
            }, 300);
        } else {
            getGoogleTtsElement(word);
        }
    }

    function playVoiceRssAudio(word) {
        var audioElement = getVoiceRssElement(word);
        if (audioElement) {
            audioElement.play();
        } else {
            canVoiceRss = false;
            playGeneratedAudio(word);
        }
    }

    function getVoiceRssElement(word) {
        var languageCode = voiceRssLanguageCodes[language],
            source = "voice rss",
            cachedElement = getCachedElement(source, word);

        if (languageCode) {
            if (cachedElement) {
                return cachedElement;
            } else {
                log("generating voice rss link for word: " + word);
                var url = 'https://api.voicerss.org/?key=' + voiceRssKey + '&src=' + encodeURIComponent(word) + '&hl=' + languageCode + '&f=48khz_16bit_stereo';
                return makeAudioElement(source, word, url, function (e) {
                    canVoiceRss = false;
                });
            }
        }
    }

    function makeAudioElement(source, word, url, onError) {
        var audioElement = document.createElement('audio');
        audioElement.setAttribute('src', url);
        $(audioElement).on('error', function(e) {
            log(source + " failed");
            onError(e);
            playGeneratedAudio(word);
        });
        setCachedElement(source, word, audioElement);
        return audioElement;
    }

    $(document).ajaxSend(function (e, xhr, settings) {
        isNetworkBusy = true;
        xhr.complete(function() {
            isNetworkBusy = false;
        });
    });

    var speechSynthesisLanguageCodes = {
        "German": "de-DE",
        "English": "en-GB",
        "Spanish (Mexico)": "es-ES",
        "Spanish (Spain)": "es-ES",
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
        "Chinese (Simplified)": "zh-CN",
        "Cantonese": "zh-HK",
        "Chinese (Traditional)": "zh-TW"
    };

    var googleTtsLanguageCodes = {
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
        "Chinese (Simplified)": "zh-CN",
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
        "Spanish (Mexico)": "es",
        "Spanish (Spain)": "es",
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
        "Chinese (Simplified)": "zh-cn",
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
        "Spanish (Mexico)": "es-es",
        "Spanish (Spain)": "es-es",
        "Swedish": "sv-se"
    };
});
