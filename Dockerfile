# Patches a known bug in the upstream cachethq/docker image: its entrypoint
# calls `php artisan cachet:install`, but that command was renamed to
# `app:install` in the bundled Cachet release.
FROM cachethq/docker:2.3.17

USER root
RUN sed -i 's|php artisan cachet:install|php artisan app:install|g' /sbin/entrypoint.sh
USER 1001
