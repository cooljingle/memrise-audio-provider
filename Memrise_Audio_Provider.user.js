// ==UserScript==
// @name           Memrise Audio Provider
// @namespace      https://github.com/cooljingle
// @description    Provides audio for any items you are learning which have none.
// @match          https://www.memrise.com/course/*/garden/*
// @match          https://www.memrise.com/garden/review/*
// @version        0.1.11
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
        localStorageIdentifier = "memrise-audio-provider-storagev2",
        localStorageVoiceRssIdentifier = "memrise-audio-provider-voicerss",
        savedChoices = JSON.parse(localStorage.getItem(localStorageIdentifier)) || {},
        speechSynthesisPlaying,
        speechSynthesisUtterance = window.speechSynthesis && new window.SpeechSynthesisUtterance(),
        voiceRssKey = localStorage.getItem(localStorageVoiceRssIdentifier) || "",
        wordColumn;

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

            MEMRISE.garden.session.make_box = (function () {
                var cached_function = MEMRISE.garden.session.make_box;
                return function () {
                    var result = cached_function.apply(this, arguments);
                    if (["end_of_session", "speed-count-down"].indexOf(result.template) < 0) {
                        var newCourseId = getCourseId(result);
                        if (courseId !== newCourseId) {
                            courseId = newCourseId;
                            wordColumn = savedChoices[courseId] || _.map(_.filter([result.learnable.item, result.learnable.definition], x => x.kind === "text"), x => x.label)[0] || "No audio";
                            editAudioOptions(result);
                        }
                        if (wordColumn !== "No audio") {
                            var isInjected = injectAudioIfRequired(result);
                            currentWord = _.find([result.learnable.definition, result.learnable.item], x => x.label === wordColumn).value;
                            if (isInjected && currentWord && !canSpeechSynthesize && canGoogleTts) {
                                preloadGoogleTts(currentWord); //required as we change referrer header while loading, which we don't want to conflict with memrise calls
                            }
                        }
                    }
                    return result;
                };
            }());

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
        var options = ["No audio"].concat([context.learnable.definition, context.learnable.item].filter(x => x.kind === "text").map(x => x.label));
        _.each(options, o => $('#audio-provider-options').append('<option value="' + o + '">' + o + '</option>'));
        $('#audio-provider-options').val(wordColumn);
        $('#audio-provider-options').change(function () {
            wordColumn = $(this).val();
            savedChoices[courseId] = wordColumn;
            localStorage.setItem(localStorageIdentifier, JSON.stringify(savedChoices));
            if (wordColumn !== "No audio") {
                currentWord = _.find([context.learnable.definition, context.learnable.item], x => x.label === wordColumn).value;
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
                if(context.template === "presentation") {
                    var screen = MEMRISE.garden.screens[context.learnable_id].presentation;
                    if(!screen.audio) {
                        screen.columns.push(column);
                        screen.audios = ["AUDIO_PROVIDER"];
                    }
                }
                return true;
            }
        } else {
            log("could not find a way to generate audio for language " + language);
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
        xhr.always(function() {
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
        "Arabic": "ar",
        "Armenian": "hy",
        "Bengali": "bn",
        "Bosnian": "bs",
        "Catalan": "ca",
        "Chinese (Simplified)": "zh-CN",
        "Chinese (Traditional)": "zh-TW",
        "Croatian": "hr",
        "Czech": "cs",
        "Danish": "da",
        "Dutch": "nl",
        "English": "en",
        "Esperanto": "eo",
        "Finnish": "fi",
        "French": "fr",
        "German": "de",
        "Greek": "el",
        "Hindi": "hi",
        "Hungarian": "hu",
        "Icelandic": "is",
        "Indonesian": "id",
        "Italian": "it",
        "Japanese": "ja",
        "Khmer": "km",
        "Korean": "ko",
        "Latin": "la",
        "Latvian": "lv",
        "Macedonian": "mk",
        "Nepali": "ne",
        "Norwegian": "no",
        "Polish": "pl",
        "Portuguese (Brazil)": "pt-BR",
        "Portuguese (Portugal)": "pt-PT",
        "Romanian": "ro",
        "Russian": "ru",
        "Serbian": "sr",
        "Sinhalese": "si",
        "Slovak": "sk",
        "Spanish (Mexico)": "es",
        "Spanish (Spain)": "es",
        "Swahili": "sw",
        "Swedish": "sv",
        "Tamil": "ta",
        "Thai": "th",
        "Turkish": "tr",
        "Ukrainian": "uk",
        "Vietnamese": "vi",
        "Welsh": "cy"
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
