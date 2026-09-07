import { Test, TestingModule } from '@nestjs/testing';
import { HttpException } from '@nestjs/common';
import axios from 'axios';
import { GeocodingService } from '@/optimization-routes/services/geocoding.service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('GeocodingService', () => {
  let service: GeocodingService;

  const mockGeocodeResponse = {
    data: {
      status: 'OK',
      results: [
        {
          geometry: {
            location: { lat: -23.5505, lng: -46.6333 },
          },
          formatted_address: 'Rua Teste, São Paulo, Brasil',
          place_id: 'place123',
        },
      ],
    },
  };

  beforeEach(async () => {
    process.env.GOOGLE_GEOCODING_API_KEY = 'test-api-key';

    const module: TestingModule = await Test.createTestingModule({
      providers: [GeocodingService],
    }).compile();

    service = module.get<GeocodingService>(GeocodingService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('geocodeAddress', () => {
    it('deve retornar coordenadas quando API OK', async () => {
      mockedAxios.get.mockResolvedValue(mockGeocodeResponse);

      const result = await service.geocodeAddress('Rua Teste, São Paulo');

      expect(result).toHaveProperty('latitude', -23.5505);
      expect(result).toHaveProperty('longitude', -46.6333);
      expect(result).toHaveProperty('formattedAddress', 'Rua Teste, São Paulo, Brasil');
      expect(result).toHaveProperty('placeId', 'place123');
    });

    it('deve lançar HttpException quando API key não configurada', async () => {
      const module = await Test.createTestingModule({
        providers: [GeocodingService],
      }).compile();
      const serviceWithoutKey = module.get<GeocodingService>(GeocodingService);

      // A chave passou a vir do config central (lido uma vez no boot), então
      // o teste zera o campo em vez de mexer em process.env.
      (serviceWithoutKey as unknown as { apiKey?: string }).apiKey = undefined;

      expect(serviceWithoutKey.isConfigured()).toBe(false);
      await expect(serviceWithoutKey.geocodeAddress('Rua Teste')).rejects.toThrow(HttpException);
    });

    it('deve lançar HttpException quando status !== OK', async () => {
      mockedAxios.get.mockResolvedValue({
        data: { status: 'ZERO_RESULTS' },
      });

      await expect(service.geocodeAddress('Endereço inexistente')).rejects.toThrow(HttpException);
    });
  });

  describe('geocodeMultipleAddresses', () => {
    it('deve retornar array de resultados', async () => {
      mockedAxios.get.mockResolvedValue(mockGeocodeResponse);

      const result = await service.geocodeMultipleAddresses([
        'Rua 1, São Paulo',
        'Rua 2, São Paulo',
      ]);

      expect(result).toBeInstanceOf(Array);
      expect(result.length).toBe(2);
      expect(result[0]).toHaveProperty('latitude');
      expect(result[0]).toHaveProperty('longitude');
    });

    it('preserva a posição de cada endereço, devolvendo null no que falhou', async () => {
      mockedAxios.get
        .mockResolvedValueOnce(mockGeocodeResponse)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(mockGeocodeResponse);

      const result = await service.geocodeMultipleAddresses([
        'Rua 1, São Paulo',
        'Endereço inválido',
        'Rua 3, São Paulo',
      ]);

      // O array precisa ter o MESMO tamanho da entrada: encurtá-lo faria o
      // chamador casar a coordenada de um pedido com outro pedido.
      expect(result).toHaveLength(3);
      expect(result[0]).toHaveProperty('latitude', -23.5505);
      expect(result[1]).toBeNull();
      expect(result[2]).toHaveProperty('latitude', -23.5505);
    });
  });

  describe('getSimulatedCoordinates', () => {
    it('deve retornar coordenadas para cidade conhecida', () => {
      const result = service.getSimulatedCoordinates('Rio de Janeiro', 'Rua Teste');

      expect(result).toHaveProperty('latitude');
      expect(result).toHaveProperty('longitude');
      expect(result).toHaveProperty('formattedAddress', 'Rua Teste, Rio de Janeiro, Brasil');
      expect(result.latitude).toBeGreaterThan(-23);
      expect(result.latitude).toBeLessThan(-22);
      expect(result.longitude).toBeGreaterThan(-44);
      expect(result.longitude).toBeLessThan(-42);
    });

    it('deve usar São Paulo como fallback para cidade desconhecida', () => {
      const result = service.getSimulatedCoordinates('Cidade Desconhecida', 'Rua Qualquer');

      expect(result).toHaveProperty('latitude');
      expect(result).toHaveProperty('longitude');
      expect(result).toHaveProperty('formattedAddress', 'Rua Qualquer, Cidade Desconhecida, Brasil');
      expect(result.latitude).toBeGreaterThan(-24);
      expect(result.latitude).toBeLessThan(-23);
      expect(result.longitude).toBeGreaterThan(-47);
      expect(result.longitude).toBeLessThan(-46);
    });
  });
});
