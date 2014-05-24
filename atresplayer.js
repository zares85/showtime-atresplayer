/*
 *  atresplayer  - Showtime Plugin
 *
 *  Copyright (C) 2014 Carlos Jurado
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
(function (plugin) {
    const PREFIX = plugin.getDescriptor().id;
    const TITLE = 'atresplayer';
    const LOGO = 'http://www.atresplayer.com/static/imgs/atres_logo.png';
    const SYNOPSYS = plugin.getDescriptor().synopsis;
    const BASEURL = 'http://www.atresplayer.com';
    const PYDOWNTV_BASEURL = 'http://www.pydowntv.com/api';
    const CATEGORIES = [
        {id: 'series',            title: 'Series'},
        {id: 'programas',         title: 'Programas'},
        {id: 'deportes',          title: 'Deportes'},
        {id: 'noticias',          title: 'Noticias'},
        {id: 'documentales',      title: 'Documentales'},
        {id: 'series-infantiles', title: 'Infatil'},
        {id: 'webseries',         title: 'Webseries'},
        {id: 'especial',          title: 'Más contenido'}
    ];
    const REGEX_PROGRAM = / +(.*?) *".*?title *= *"(.*?)".*?href *= *"(.*?)".*?img.*?src *= *"(.*?)".*/;
    const REGEX_SEASON = /.*href *= *"(.*?)" *>(.*?)<.*/;
    const REGEX_RESULT = /<img *src *= *"(.*?)".*href *= *"(.*?)" *>(.*?)<.*?<p.*?>(.*?)<\/.*<p.*?>(.*?)</;

    // Create the showtime service and link to the statPage
    plugin.createService(TITLE, PREFIX + ':start', 'tv', true, LOGO);

    // Create the settings (no settings at this moment)
    var settings = plugin.createSettings(TITLE, LOGO, SYNOPSYS);
    settings.createInfo('info', LOGO, SYNOPSYS);
    var credentials = null;

    // Map URIs and functions
    plugin.addURI(PREFIX + ':start', startPage);
    plugin.addURI(PREFIX + ':category:(.*)', categoryPage); //category object
    plugin.addURI(PREFIX + ':program:(.*)', programPage); // program object
    plugin.addURI(PREFIX + ':episode:(.*)', episodePage); // episode object

    // URI functions
    function categoryURI(category) {
        return PREFIX + ':category:' + showtime.JSONEncode(category);
    }
    function programURI(program) {
        return PREFIX + ':program:' + showtime.JSONEncode(program);
    }
    function episodeURI(episode) {
        return PREFIX + ':episode:' + showtime.JSONEncode(episode);
    }

    // Create the searcher
    plugin.addSearcher(TITLE, LOGO, searchPage);

    // ==========================================================================
    // CONTROLLERS
    // ==========================================================================

    function login() {
        // Credentials
        var reason = 'Login to ' + BASEURL + ' to get full access content.';
        var query = false;
        while (true) {
            credentials = plugin.getAuthCredentials(TITLE, reason, query);

            if(!credentials) {
                if(!query) {
                    query = true;
                    continue;
                }
                return false;
            }

            if (credentials.rejected) {
                return false;
            }

            if (credentials.username == "" || credentials.password == "") {
                if (!query) {
                    query = true;
                    continue;
                }
                return false;
            }

            var postdata = {j_username: credentials.username, j_password: credentials.password};
            var res = showtime.httpReq('https://servicios.atresplayer.com/j_spring_security_check', {postdata: postdata});
            if (res.toString().indexOf('"error":true') !== -1) {
                reason = 'Wrong username or password. Please, try again.';
                continue;
            }
            if (query) {
                showtime.notify('Login successfully', 1);
            }
            return true;
        }
    }

    /**
     * Define the start page
     * @param page
     */
    function startPage(page) {
        // Add categories
        for (var i = 0; i < CATEGORIES.length; i++) {
            var category = CATEGORIES[i];
            page.appendItem(categoryURI(category), 'directory', {title: category.title});
        }

        login();

        page.type = 'directory';
        page.contents = 'items';
        page.metadata.logo = LOGO;
        page.metadata.title = TITLE;
        page.loading = false;
    }

    /**
     * Define a program category page
     *
     * @param page
     * @param category
     */
    function categoryPage(page, category) {
        category = showtime.JSONDecode(category);
        var html = getCategoryHTML(category);
        var programs = parsePrograms(html, category);

        displayPrograms(page, programs);

        page.type = 'directory';
        page.contents = 'items';
        page.metadata.logo = LOGO;
        page.metadata.title = category.title;
        page.loading = false;
    }

    /**
     * Define a program page
     *
     * @param page
     * @param {string} program encoded program object
     */
    function programPage(page, program) {
        program = showtime.JSONDecode(program);
        var html = getProgramHTML(program);
        var seasons = parseSeasons(html, program);

        var i = 0;
        function paginator() {
            if (i >= seasons.length) {
                return false
            }
            var html = getSeasonHTML(seasons[i]);
            var episodes = parseEpisodes(html);
            if (seasons.length > 1) {
                displaySeason(page, seasons[i]);
            }
            displayEpisodes(page, episodes);
            return seasons.length > ++i;
        }

        paginator();
        page.paginator = paginator;
        page.type = 'directory';
        page.contents = 'items';
        page.metadata.logo = program.logo;
        page.metadata.title = program.title;
        page.loading = false;
    }

    /**
     * Define a search page
     *
     * @param page
     * @param {string} query
     */
    function searchPage(page, query) {
        showtime.trace('Searching: ' + query, PREFIX);
        var pag = 1;
        page.entries = 0;
        function paginator() {
            var html = getSearchHTML(query, pag++);
            var results = parseResults(html);
            displayEpisodes(page, results);
            page.entries += results.length;
            return results.length != 0;
        }

        paginator();
        page.type = 'directory';
        page.contents = 'ĺist';
        page.paginator = paginator;
        page.loading = false;
    }

    /**
     * Define a episode page
     * Gets and plays the episodes
     *
     * @param page
     * @param episode
     */
    function episodePage(page, episode) {
        episode = showtime.JSONDecode(episode);
        var video = getVideoParams(episode);

        showtime.trace('Playing: ' + video.sources[0].url, PREFIX);
        page.type = 'video';
        page.source = 'videoparams:' + showtime.JSONEncode(video);
        page.loading = false;
    }

    // ==========================================================================
    // MODELS
    // ==========================================================================

    /**
     * Returns the HTML page of a category
     *
     * @param   {object} category
     * @returns {string} HTML page
     */
    function getCategoryHTML(category) {
        var url = BASEURL + '/television/' + category.id;
        showtime.trace('Loading: ' + url, PREFIX);
        return showtime.httpReq(url).toString();
    }

    /**
     * Returns the HTML page of a program
     *
     * @param   {object} program
     * @returns {string} HTML page
     */
    function getProgramHTML(program) {
        var url = program.url;
        showtime.trace('Loading: ' + url, PREFIX);
        return showtime.httpReq(url).toString();
    }

    /**
     * Returns the HTML page of a season
     *
     * @param   {object} season
     * @returns {string} HTML page
     */
    function getSeasonHTML(season) {
        var url = season.url + '/carousel.json';
        showtime.trace('Loading: ' + url, PREFIX);
        return showtime.httpReq(url).toString();
    }

    /**
     * Returns the HTML page of the query results
     *
     * @param {string} query
     * @returns {string} HTML page
     */
    function getSearchHTML(query, pag) {
        var args = {buscar: query, pag: pag};
        var url = BASEURL + '/buscador/getResultsHtml/';
        showtime.trace('Loading: ' + url + '?buscar=' + query + '&pag=' + pag, PREFIX);
        return showtime.httpReq(url, {args: args}).toString();
    }

    /**
     * Returns a showtime videoparams object from a episode
     * Uses the PyDownTV API http://www.pydowntv.com/api to obtain the info
     *
     * @param episode
     * @returns {object}
     */
    function getVideoParams(episode) {
        var args = {url: episode.url};
        var headers = {Cookie: 'a3user=' + credentials.username + '; a3pass=' + credentials.password};
        showtime.trace('Loading: ' + url + '?url=' + episode.url, PREFIX);
        var json = showtime.httpReq(PYDOWNTV_BASEURL, {args: args, headers: headers}).toString();
        showtime.print(json);
        json = showtime.JSONDecode(json);
        if (!json.exito) {
            return null; // fail
        }
        var sources = [];
//        for (var i = 0; i < json.videos[0].url_video.length; i++) {
//            var url = json.videos[0].url_video[i];
//            var json_url = showtime.httpReq(url).toString();
//            json_url = showtime.JSONDecode(json_url);
//            sources.push({url: json_url.resultDes});
//        }
        for (var i = 0; i < json.videos[0].url_video.length; i++) {
            sources.push({url: json.videos[0].url_video[i]});
        }
        return {
            sources     : sources,
            title       : json.titulos[0],
            no_fs_scan  : true,
            canonicalUrl: episodeURI(episode)
        };
    }

    // ==========================================================================
    // HTML PARSERS
    // ==========================================================================

    /**
     * Parses the category html page and returns the list of programs
     *
     * @param   {string} html
     * @param   {object} category
     * @returns {Array} programs
     */
    function parsePrograms(html, category) {
        var init = html.indexOf('<div class="container_12 clearfix pad_10 black_13">');
        init = html.indexOf('<div class="mod_promo', init);
        var end = html.indexOf('<div class="shell relative">', init);
        html = html.slice(init, end);
        html = html.replace(/[\n\r]/g, ' '); // Remove break lines

        // Split and parse programs
        var programs = [];
        var split = html.split('<div class="mod_promo');
        for (var i = 0; i < split.length; i++) {
            var item = split[i];
            var program = {};
            var match = item.match(REGEX_PROGRAM);
            if (match) {
                // Add the matched program to the list
                program.id = null;
                program.url = fullURL(match[3]);
                program.title = match[2];
                program.cadena = match[1];
                program.icon = fullURL(match[4]);
                programs.push(program);
            }
        }
        return programs;
    }

    /**
     * Parses the program html page and returns the list of seasons
     *
     * @param   {string} html
     * @returns {Array} seasons
     */
    function parseSeasons(html, program) {
        var init = html.indexOf('<ul class="fn_lay'); // Begins seasons
        if (init < 0 ) {
            return [{
                id: null,
                url: program.url,
                title: 'Temporada 1'
            }];
        }
        init = html.indexOf('<li', init); // Begins seasons
        var end = html.indexOf('</ul>', init) + 1; // Ends seasons
        html = html.slice(init, end);
        html = html.replace(/[\n\r]/g, ' '); // Remove break lines

        var seasons = [];
        var split = html.split('<li');
        for (var i = 0; i < split.length; i++) {
            var item = split[i];
            var season = {};
            var match = item.match(REGEX_SEASON);
            if (match) {
                seasons.push({
                    id   : null,
                    url: match[1],
                    title: match[2]
                });
            }
        }
        return seasons;
    }

    /**
     * Parses the season html page and returns the list of episodes
     *
     * @param   {string} html
     * @returns {Array} episodes
     */
    function parseEpisodes(html) {
        var json = showtime.JSONDecode(html);
        var episodes = [];
        for (var i = 0; i < json.length; i++) {
            var item = json[i];
            var episode = {
                id         : null,
                title      : item.title,
                description: item.textButton,
                icon       : fullURL(item.srcImage),
                url        : fullURL(item.hrefHtml)
            };
            episodes.push(episode);
        }
        return episodes;
    }

    /**
     * Parses the search html page an return the list of results
     * @param {string} html
     */
    function parseResults(html) {
        var init = html.indexOf('<div class="resultSet">');
        init = html.indexOf('<div class="post">', init);
        var end = html.indexOf('<div class="Pagination">', init);
        html = html.slice(init, end);
        html = html.replace(/[\n\r]/g, ' '); // Remove break lines

        var results = [];
        var split = html.split(/<div class="post">/);
        for (var i = 0; i < split.length; i++) {
            var item = split[i];
            var match = item.match(REGEX_RESULT);
            if (match) {
                var result = {
                    icon       : match[1],
                    url        : match[2],
                    title      : match[3],
                    subtitle   : match[4],
                    description: match[5]
                };
                results.push(result);
            }
        }
        return results;
    }

    /**
     * Returns the full path of URLs
     * Add the BASEURL to relatives paths
     *
     * @param {string} url
     * @returns {string} url full path
     */
    function fullURL(url) {
        return url.indexOf(BASEURL) == -1 ? BASEURL + url : url;
    }

    // ==========================================================================
    // VIEWS
    // ==========================================================================

    /**
     * Display the program list
     *
     * @param page
     * @param {Array} programs
     */
    function displayPrograms(page, programs) {
        for (var i = 0; i < programs.length; i++) {
            var program = programs[i];
            var metadata = getProgramMetadata(program);
            page.appendItem(programURI(program), 'video', metadata);
        }
    }

    /**
     * Display the season
     *
     * @param page
     * @param seasons
     */
    function displaySeason(page, season) {
        var metadata = getSeasonMetadata(season);
        page.appendItem('', 'separator', metadata);
    }

    /**
     * Display the episode list
     *
     * @param page
     * @param {Array} episodes
     */
    function displayEpisodes(page, episodes) {
        for (var i = 0; i < episodes.length; i++) {
            var episode = episodes[i];
            page.appendItem(episodeURI(episode), 'video', getEpisodeMetadata(episode));
        }
    }

    // ==========================================================================
    // VIEW HELPERS
    // ==========================================================================

    /**
     * Returns a metadata object for a given program
     *
     * @param   {object} program
     * @returns {object} showtime item metadata
     */
    function getProgramMetadata(program) {
        var title = program.title;
        return {
            title: new showtime.RichText(title),
            icon : program.icon
        };
    }

    /**
     * Returns a metadata object for a given season
     *
     * @param   {object} season
     * @returns {object} showtime item metadata
     */
    function getSeasonMetadata(season) {
        var title = season.title;
        return {
            title: new showtime.RichText(title)
        };
    }

    /**
     * Returns a metadata object for a given episode
     *
     * @param   {object} episode
     * @returns {object} showtime item metadata
     */
    function getEpisodeMetadata(episode) {
        var title = episode.title;
        var desc = '';
        if (episode.subtitle) {
            title += ' - ' + episode.subtitle;
        }

        if (episode.date) {
            desc += '<font size="4">' + 'Fecha: ' + '</font>';
            desc += '<font size="4" color="#daa520">' + episode.date + '</font>\n';
        }
        if (episode.description) {
            desc += episode.description;
        }

        return {
            title      : new showtime.RichText(title),
            description: new showtime.RichText(desc),
            icon       : episode.icon
        };

    }

})(this);
