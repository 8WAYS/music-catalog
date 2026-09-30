import { describe, expect, it } from 'vitest';
import { spotifyAlbumUrl, vkSearchUrl, yandexSearchUrl } from '../../src/services/links';

describe('yandexSearchUrl / vkSearchUrl', () => {
  it('кодируют пробелы, кириллицу и спецсимволы в запросе', () => {
    expect(yandexSearchUrl('Молчат Дома & друзья')).toBe(
      'https://music.yandex.ru/search?text=' + encodeURIComponent('Молчат Дома & друзья'),
    );
    expect(vkSearchUrl('Молчат Дома & друзья')).toBe(
      'https://vk.com/audio?q=' + encodeURIComponent('Молчат Дома & друзья'),
    );
  });

  it('работают с пустым запросом, не бросают', () => {
    expect(yandexSearchUrl('')).toBe('https://music.yandex.ru/search?text=');
    expect(vkSearchUrl('')).toBe('https://vk.com/audio?q=');
  });
});

describe('spotifyAlbumUrl', () => {
  it('строит ссылку на альбом по id', () => {
    expect(spotifyAlbumUrl('4LH4d3cOWNNsVw41Gqt2kv')).toBe(
      'https://open.spotify.com/album/4LH4d3cOWNNsVw41Gqt2kv',
    );
  });
});
