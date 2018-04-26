const gulp = require('gulp');

const config = require('config');
const {migrateLatest, migrateRollback} =
  require('davis-sql')(config.storage).tools;

gulp.task('migrate:latest', migrateLatest);

gulp.task('migrate:rollback', migrateRollback);
