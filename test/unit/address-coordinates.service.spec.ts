import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AddressCoordinatesService } from '@/optimization-routes/services/address-coordinates.service';
import { GeocodeCache } from '@/shared/entities/geocode-cache.entity';
import { GeocodingService } from '@/optimization-routes/services/geocoding.service';
import { buildAddressKey } from '@/shared/domain/address-key';

/**
 * Este serviço existe para não pagar duas vezes pelo mesmo endereço. Os testes
 * cobrem justamente isso: quando a consulta paga acontece e quando não.
 */
describe('AddressCoordinatesService', () => {
  let service: AddressCoordinatesService;
  let cacheRepository: Repository<GeocodeCache>;
  let geocodingService: GeocodingService;

  const endereco = {
    street: 'Avenida Paulista',
    number: '1000',
    district: 'Bela Vista',
    city: 'São Paulo',
    state: 'SP',
    zipCode: '01310-100',
  };

  const montar = async (opcoes: {
    emCache?: Partial<GeocodeCache> | null;
    configurado?: boolean;
  }) => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AddressCoordinatesService,
        {
          provide: getRepositoryToken(GeocodeCache),
          useValue: {
            findOne: jest.fn().mockResolvedValue(opcoes.emCache ?? null),
            increment: jest.fn().mockResolvedValue({ affected: 1 }),
            create: jest.fn((dados: unknown) => dados),
            save: jest.fn().mockResolvedValue({}),
          },
        },
        {
          provide: GeocodingService,
          useValue: {
            isConfigured: jest.fn().mockReturnValue(opcoes.configurado ?? true),
            geocodeAddress: jest.fn().mockResolvedValue({
              latitude: -23.5614,
              longitude: -46.6559,
              formattedAddress: 'Av. Paulista, 1000 - Bela Vista, São Paulo - SP',
            }),
            getSimulatedCoordinates: jest
              .fn()
              .mockReturnValue({ latitude: -23.5505, longitude: -46.6333 }),
          },
        },
      ],
    }).compile();

    service = module.get(AddressCoordinatesService);
    cacheRepository = module.get(getRepositoryToken(GeocodeCache));
    geocodingService = module.get(GeocodingService);
  };

  describe('resolve', () => {
    it('usa o cache e não gasta consulta quando o endereço já foi resolvido', async () => {
      await montar({ emCache: { id: 5, latitude: -23.5614, longitude: -46.6559 } });

      const resultado = await service.resolve(endereco);

      expect(resultado).toMatchObject({ source: 'cache', latitude: -23.5614 });
      expect(geocodingService.geocodeAddress).not.toHaveBeenCalled();
      // O contador é o que mostra quanto o cache está economizando.
      expect(cacheRepository.increment).toHaveBeenCalledWith({ id: 5 }, 'hits', 1);
    });

    it('geocodifica e guarda quando o endereço é novo', async () => {
      await montar({ emCache: null });

      const resultado = await service.resolve(endereco);

      expect(resultado).toMatchObject({ source: 'geocoding' });
      expect(geocodingService.geocodeAddress).toHaveBeenCalledTimes(1);
      expect(cacheRepository.save).toHaveBeenCalledTimes(1);
    });

    it('não grava coordenada simulada no cache', async () => {
      await montar({ emCache: null, configurado: false });

      const resultado = await service.resolve(endereco, 'São Paulo');

      expect(resultado?.source).toBe('simulated');
      // Cachear estimativa envenenaria o cache quando a chave real fosse ligada.
      expect(cacheRepository.save).not.toHaveBeenCalled();
    });

    it('recusa endereço incompleto em vez de geocodificar o centro da cidade', async () => {
      await montar({ emCache: null });

      const resultado = await service.resolve({ city: 'São Paulo', state: 'SP' });

      expect(resultado).toBeNull();
      expect(geocodingService.geocodeAddress).not.toHaveBeenCalled();
    });
  });

  describe('storedIsFresh', () => {
    it('aceita a coordenada guardada quando o endereço não mudou', async () => {
      await montar({});
      const chave = buildAddressKey(endereco);

      expect(service.storedIsFresh(chave, -23.5, -46.6, chave)).toBe(true);
    });

    it('recusa a coordenada quando o endereço mudou', async () => {
      await montar({});
      const chave = buildAddressKey(endereco);
      const outra = buildAddressKey({ ...endereco, number: '2000' });

      expect(service.storedIsFresh(chave, -23.5, -46.6, outra)).toBe(false);
    });

    it('recusa quando há chave mas não há coordenada', async () => {
      await montar({});
      const chave = buildAddressKey(endereco);

      expect(service.storedIsFresh(chave, null, null, chave)).toBe(false);
    });
  });
});

describe('buildAddressKey', () => {
  it('trata abreviação e acento como o mesmo endereço', () => {
    const comAbreviacao = buildAddressKey({
      street: 'Av. Paulista',
      number: '1000',
      district: 'Bela Vista',
      city: 'Sao Paulo',
      state: 'SP',
      zipCode: '01310100',
    });
    const porExtenso = buildAddressKey({
      street: 'Avenida Paulista',
      number: '1000',
      district: 'Bela Vista',
      city: 'São Paulo',
      state: 'sp',
      zipCode: '01310-100',
    });

    expect(comAbreviacao).toBe(porExtenso);
  });

  it('separa endereços que diferem no número', () => {
    const mil = buildAddressKey({ street: 'Rua A', number: '1000', city: 'Santos', state: 'SP' });
    const doisMil = buildAddressKey({ street: 'Rua A', number: '2000', city: 'Santos', state: 'SP' });

    expect(mil).not.toBe(doisMil);
  });

  it('devolve null quando falta rua, cidade ou estado', () => {
    expect(buildAddressKey({ city: 'Santos', state: 'SP' })).toBeNull();
    expect(buildAddressKey({ street: 'Rua A', state: 'SP' })).toBeNull();
  });
});
