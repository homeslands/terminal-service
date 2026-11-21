import {
  createMap,
  extend,
  forMember,
  mapFrom,
  Mapper,
  MappingConfiguration,
  mapWith,
} from '@automapper/core';
import { AutomapperProfile, InjectMapper } from '@automapper/nestjs';
import { Injectable } from '@nestjs/common';
import { Order } from './order.entity';
import {
  ApprovalUserResponseDto,
  ChefOrderNestedOrderResponseDto,
  CreateOrderRequestDto,
  OrderBaseResponseDto,
  OrderResponseDto,
  OrderTableResponseDto,
  OwnerResponseDto,
} from './order.dto';
import { baseMapper } from 'src/app/base.mapper';
import { User } from 'src/user/user.entity';
import { OrderItemResponseDto } from 'src/order-item/order-item.dto';
import { OrderItem } from 'src/order-item/order-item.entity';
import { Table } from 'src/table/table.entity';
import { VoucherResponseDto } from 'src/voucher/voucher.dto';
import { Voucher } from 'src/voucher/entity/voucher.entity';
import { ChefOrderResponseDto } from 'src/chef-order/chef-order.dto';
import { ChefOrder } from 'src/chef-order/chef-order.entity';
import { RoleResponseDto } from 'src/role/role.dto';
import { Role } from 'src/role/role.entity';
import { Address } from 'src/google-map/entities/address.entity';
import { AddressResponseDto } from 'src/google-map/dto/google-map.response.dto';

// Buoc 7.4 (QD5) - member chung cua moi DTO don hang (`OrderBaseResponseDto`),
// dung cho ca `OrderResponseDto` lan `ChefOrderNestedOrderResponseDto`. Them
// member o day la them cho ca hai - hai shape khong lech nhau ngoai
// `owner` / `approvalBy`.
const orderBaseMembers = <
  TDestination extends OrderBaseResponseDto,
>(): MappingConfiguration<Order, TDestination>[] => [
  forMember<Order, TDestination>(
    (destination) => destination.orderItems,
    mapWith(OrderItemResponseDto, OrderItem, (source) => source.orderItems),
  ),
  forMember<Order, TDestination>(
    (destination) => destination.voucher,
    mapWith(VoucherResponseDto, Voucher, (source) => source.voucher),
  ),
  forMember<Order, TDestination>(
    (destination) => destination.chefOrders,
    mapWith(ChefOrderResponseDto, ChefOrder, (source) => source.chefOrders),
  ),
  forMember<Order, TDestination>(
    (destination) => destination.printerInvoices,
    mapFrom((source: any) => source.printerInvoices),
  ),
  forMember<Order, TDestination>(
    (destination) => destination.deliveryTo,
    mapWith(AddressResponseDto, Address, (source) => source.deliveryTo),
  ),
];

@Injectable()
export class OrderProfile extends AutomapperProfile {
  constructor(@InjectMapper() mapper: Mapper) {
    super(mapper);
  }

  override get profile() {
    return (mapper: Mapper) => {
      createMap(
        mapper,
        Order,
        OrderResponseDto,
        forMember(
          (destination) => destination.owner,
          mapWith(OwnerResponseDto, User, (source) => source.owner),
        ),
        forMember(
          (destination) => destination.approvalBy,
          mapWith(ApprovalUserResponseDto, User, (source) => source.approvalBy),
        ),
        ...orderBaseMembers<OrderResponseDto>(),
        extend(baseMapper(mapper)),
      );

      // Buoc 7.4 (QD5): `order` long trong DTO bep - khong `owner`/`approvalBy`.
      createMap(
        mapper,
        Order,
        ChefOrderNestedOrderResponseDto,
        ...orderBaseMembers<ChefOrderNestedOrderResponseDto>(),
        extend(baseMapper(mapper)),
      );

      createMap(
        mapper,
        User,
        OwnerResponseDto,
        forMember(
          (destination) => destination.role,
          mapWith(RoleResponseDto, Role, (source) => source.role),
        ),
        extend(baseMapper(mapper)),
      );

      createMap(
        mapper,
        Table,
        OrderTableResponseDto,
        extend(baseMapper(mapper)),
      );

      createMap(
        mapper,
        User,
        ApprovalUserResponseDto,
        extend(baseMapper(mapper)),
      );

      createMap(mapper, CreateOrderRequestDto, Order);
    };
  }
}
